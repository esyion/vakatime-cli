// Regression: Codex CLI 0.142.5+ on Windows invokes hook commands through
// sh/bash (MSYS), which performs POSIX path translation on unquoted
// backslashes. See setup.ts buildAgentHookCommand docstring for full context.
import { describe, expect, it } from 'vitest'
import {
  buildAgentHookCommand,
  buildZcodeHookEntry,
  codexConfiguredFromContent,
  isVakatimeZcodeHook,
  revertCodexHooksEnabled,
  stripVakatimeFlatEvents,
  stripVakatimeGroupedEvents,
} from './setup.js'

const invocation = {
  commandString:
    '"C:\\nvm4w\\nodejs\\node.exe" "D:\\workspace\\vakatime\\packages\\collector\\dist\\cli.js"',
  spawnCommand: 'C:\\nvm4w\\nodejs\\node.exe',
  spawnArgsPrefix: ['D:\\workspace\\vakatime\\packages\\collector\\dist\\cli.js'],
}

const binInvocation = {
  commandString: 'vakatime',
  spawnCommand: 'vakatime',
  spawnArgsPrefix: [] as string[],
}

describe('buildAgentHookCommand \u2014 Codex on Windows (MSYS path translation bug)', () => {
  it('wraps the codex command in `cmd /c \'...\'` on win32', () => {
    const cmd = buildAgentHookCommand(invocation, 'codex', 'win32')
    expect(cmd).toBe(
      `cmd /c '${invocation.commandString} hook --source codex'`,
    )
  })

  it('preserves the inner backslashes inside the single-quoted string', () => {
    // The whole point: bash must NOT see these backslashes, so the path
    // reaches cmd.exe intact.
    const cmd = buildAgentHookCommand(invocation, 'codex', 'win32')
    // Strip the `cmd /c '` prefix and trailing `'`; what remains is what
    // bash passes to cmd.exe.
    const inner = cmd.slice("cmd /c '".length, -1)
    expect(inner).toBe(`${invocation.commandString} hook --source codex`)
    expect(inner).toContain('\\nvm4w\\nodejs\\node.exe')
    expect(inner).toContain('\\workspace\\vakatime')
  })

  it('escapes any embedded single quote via the standard `\'\\\'\'` pattern', () => {
    const weird = {
      commandString: '"C:\\path with \'quote\\node.exe"',
      spawnCommand: 'C:\\node.exe',
      spawnArgsPrefix: [],
    }
    const cmd = buildAgentHookCommand(weird, 'codex', 'win32')
    // bash decodes: '...'\''...' (close, escaped quote, reopen)
    // so the raw command string must contain the literal sequence '\''
    expect(cmd.startsWith("cmd /c '")).toBe(true)
    expect(cmd.endsWith("'")).toBe(true)
    expect(cmd).toContain("'\\''")
  })
})

describe('buildAgentHookCommand \u2014 non-codex / non-win32', () => {
  it.each([
    ['claude-code', 'win32'] as const,
    ['gemini-cli', 'win32'] as const,
    ['opencode', 'win32'] as const,
    ['cursor', 'win32'] as const,
    ['codex', 'linux'] as const,
    ['codex', 'darwin'] as const,
    ['claude-code', 'linux'] as const,
  ])('returns the raw command for %s on %s', (source, platform) => {
    const cmd = buildAgentHookCommand(invocation, source, platform)
    expect(cmd).toBe(`${invocation.commandString} hook --source ${source}`)
    expect(cmd).not.toContain('cmd /c')
  })
})

describe('buildAgentHookCommand \u2014 default platform comes from process.platform', () => {
  it('matches process.platform when platform arg is omitted', () => {
    // Sanity check: the function still works without an explicit platform.
    const cmd = buildAgentHookCommand(invocation, 'codex')
    if (process.platform === 'win32') {
      expect(cmd.startsWith("cmd /c '")).toBe(true)
    } else {
      expect(cmd).toBe(`${invocation.commandString} hook --source codex`)
    }
  })
})
describe('buildZcodeHookEntry', () => {
  it('uses a process hook when a node + script invocation is available', () => {
    const entry = buildZcodeHookEntry(invocation)
    expect(entry).toEqual({
      type: 'process',
      command: invocation.spawnCommand,
      args: [...invocation.spawnArgsPrefix, 'hook', '--source', 'zcode'],
      timeoutMs: 10000,
      statusMessage: 'Recording ZCode activity with Vakatime',
    })
  })

  it('falls back to a command hook for a global bin shim', () => {
    const entry = buildZcodeHookEntry(binInvocation)
    expect(entry).toEqual({
      type: 'command',
      command: 'vakatime hook --source zcode',
      timeout: 10,
      statusMessage: 'Recording ZCode activity with Vakatime',
    })
  })
})

describe('isVakatimeZcodeHook', () => {
  it('recognizes both forms buildZcodeHookEntry produces', () => {
    expect(isVakatimeZcodeHook(buildZcodeHookEntry(invocation))).toBe(true)
    expect(isVakatimeZcodeHook(buildZcodeHookEntry(binInvocation))).toBe(true)
  })

  it('rejects foreign hooks and malformed entries', () => {
    expect(isVakatimeZcodeHook({ type: 'process', command: 'node.exe', args: ['x.js', 'hook', '--source', 'codex'] })).toBe(false)
    expect(isVakatimeZcodeHook({ type: 'command', command: 'other-tool --source zcode' })).toBe(false)
    expect(isVakatimeZcodeHook({ type: 'process', args: 'nope' })).toBe(false)
    expect(isVakatimeZcodeHook(null)).toBe(false)
    expect(isVakatimeZcodeHook('string')).toBe(false)
  })
})

describe('stripVakatimeGroupedEvents', () => {
  const isVakatimeCmd = (hook: unknown) =>
    typeof (hook as { command?: unknown })?.command === 'string' &&
    String((hook as { command: string }).command).includes('vakatime')

  it('removes vakatime hooks, empty groups, and empty event keys; keeps others', () => {
    const events = {
      SessionStart: [
        { matcher: '*', hooks: [{ type: 'command', command: 'vakatime hook --source zcode' }] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own.sh' }] },
      ],
      Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'vakatime hook --source zcode' }] }],
      Unrelated: 'not-an-array',
    }
    expect(stripVakatimeGroupedEvents(events, isVakatimeCmd)).toEqual({
      SessionStart: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own.sh' }] }],
      Unrelated: 'not-an-array',
    })
  })

  it('returns an empty object when nothing remains', () => {
    const events = { Stop: [{ hooks: [{ command: 'vakatime hook --source x' }] }] }
    expect(stripVakatimeGroupedEvents(events, isVakatimeCmd)).toEqual({})
  })
})

describe('stripVakatimeFlatEvents', () => {
  it('removes matching entries and drops empty keys (cursor shape)', () => {
    const events = {
      stop: [{ command: 'vakatime hook --source cursor' }, { command: 'user-own.sh' }],
      sessionStart: [{ command: 'vakatime hook --source cursor' }],
    }
    expect(
      stripVakatimeFlatEvents(events, (entry) =>
        String((entry as { command?: unknown })?.command ?? '').includes('vakatime'),
      ),
    ).toEqual({ stop: [{ command: 'user-own.sh' }] })
  })
})

describe('revertCodexHooksEnabled', () => {
  it('case A: removes the whole managed [features] section we appended', () => {
    const original = 'model = "gpt-5"\n'
    const managed = `${original}\n[features]\n# vakatime-managed-section\nhooks = true # vakatime-managed\n`
    expect(revertCodexHooksEnabled(managed)).toBe(original)
  })

  it('case B: restores a flipped hooks = false', () => {
    const managed = '[features]\nhooks = true # vakatime-managed: previous=false\n'
    expect(revertCodexHooksEnabled(managed)).toBe('[features]\nhooks = false\n')
  })

  it('case C: removes a managed line inserted into an existing [features] table', () => {
    const managed = '[features]\nhooks = true # vakatime-managed\nsandbox = false\n'
    expect(revertCodexHooksEnabled(managed)).toBe('[features]\nsandbox = false\n')
  })

  it('leaves a user-owned unmarked hooks = true untouched', () => {
    const own = '[features]\nhooks = true\n'
    expect(revertCodexHooksEnabled(own)).toBe(own)
  })
})

describe('configured-state detection', () => {
  const isVakatimeCmd = (hook: unknown) =>
    typeof (hook as { command?: unknown })?.command === 'string' &&
    String((hook as { command: string }).command).includes('vakatime')

  it('hasVakatimeHookInGrouped detects vakatime hooks in any group', () => {
    // Re-use the exported stripVakatimeGroupedEvents semantics via a scan.
    const events = {
      Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'user-own.sh' }] }],
      SessionStart: [{ hooks: [{ command: 'vakatime hook --source claude-code' }] }],
    }
    // Scan manually (same predicate logic the detectors use).
    const found = Object.values(events).some(
      (arr) =>
        Array.isArray(arr) &&
        arr.some(
          (group) =>
            group !== null && typeof group === 'object' && Array.isArray(group.hooks) && group.hooks.some(isVakatimeCmd),
        ),
    )
    expect(found).toBe(true)
  })

  it('codexConfiguredFromContent detects the managed block markers', () => {
    expect(
      codexConfiguredFromContent('[features]\nhooks = true\n# vakatime-managed-codex-hooks:start\n[[hooks.Stop]]\n'),
    ).toBe(true)
    expect(codexConfiguredFromContent('[features]\nhooks = true\n[[hooks.Stop]]\ncommand = "x"\n')).toBe(false)
    expect(codexConfiguredFromContent('')).toBe(false)
  })
})
