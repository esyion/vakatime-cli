// Regression: Codex CLI 0.142.5+ on Windows invokes hook commands through
// sh/bash (MSYS), which performs POSIX path translation on unquoted
// backslashes. See setup.ts buildAgentHookCommand docstring for full context.
import { describe, expect, it } from 'vitest'
import { buildAgentHookCommand } from './setup.js'

const invocation = {
  commandString:
    '"C:\\nvm4w\\nodejs\\node.exe" "D:\\workspace\\vakatime\\packages\\collector\\dist\\cli.js"',
  spawnCommand: 'C:\\nvm4w\\nodejs\\node.exe',
  spawnArgsPrefix: ['D:\\workspace\\vakatime\\packages\\collector\\dist\\cli.js'],
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