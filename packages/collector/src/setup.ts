import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export type AgentType = 'claude-code' | 'codex' | 'cursor' | 'opencode' | 'gemini-cli' | 'zcode'

type JsonRecord = Record<string, unknown>

const CODEX_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop'] as const
const ZCODE_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop'] as const
const OPENCODE_PLUGIN_NAME = 'vakatime.js'

function isJsonObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// --- configured-state detection (pure parts are unit-tested) ---

function hasVakatimeHookInGrouped(events: unknown, predicate: (hook: unknown) => boolean): boolean {
  if (!isJsonObject(events)) return false
  return Object.values(events).some(
    (value) =>
      Array.isArray(value) &&
      value.some(
        (group) => isJsonObject(group) && Array.isArray(group.hooks) && (group.hooks as unknown[]).some(predicate),
      ),
  )
}

function hasVakatimeHookInFlat(events: unknown, predicate: (entry: unknown) => boolean): boolean {
  if (!isJsonObject(events)) return false
  return Object.values(events).some((value) => Array.isArray(value) && value.some(predicate))
}

/**
 * True when the Codex TOML carries our managed inline hooks block. The block
 * markers are only ever written by `setup`, so their presence means "we
 * configured this".
 */
export function codexConfiguredFromContent(configContent: string): boolean {
  return configContent.includes(CODEX_HOOKS_BLOCK_START)
}

/**
 * Detect whether vakatime currently has hooks installed for `agent` in that
 * agent's native configuration. Mirrors what `removeAgent` would clean up.
 */
export function isAgentConfigured(agent: AgentType): boolean {
  try {
    switch (agent) {
      case 'claude-code': {
        const settings = readJsonObject(homePath('.claude', 'settings.json'))
        return hasVakatimeHookInGrouped(settings.hooks, isVakatimeCommandHook)
      }
      case 'codex': {
        const configPath = homePath('.codex', 'config.toml')
        if (!existsSync(configPath)) return false
        return codexConfiguredFromContent(readFileSync(configPath, 'utf-8'))
      }
      case 'cursor': {
        const hooksData = readJsonObject(homePath('.cursor', 'hooks.json'))
        return hasVakatimeHookInFlat(hooksData.hooks, (entry) => isVakatimeCommandHook(entry))
      }
      case 'opencode': {
        return existsSync(join(opencodeConfigDir(), 'plugins', OPENCODE_PLUGIN_NAME))
      }
      case 'gemini-cli': {
        const settings = readJsonObject(homePath('.gemini', 'settings.json'))
        return hasVakatimeHookInGrouped(settings.hooks, isVakatimeCommandHook)
      }
      case 'zcode': {
        const config = readJsonObject(homePath('.zcode', 'cli', 'config.json'))
        return isJsonObject(config.hooks) && hasVakatimeHookInGrouped(config.hooks.events, isVakatimeZcodeHook)
      }
    }
  } catch {
    return false
  }
}

function homePath(...parts: string[]): string {
  return join(homedir(), ...parts)
}

interface VakatimeInvocation {
  commandString: string
  spawnCommand: string
  spawnArgsPrefix: string[]
}

function getVakatimeBinPath(): string {
  const currentPath = process.argv[1]
  return currentPath && currentPath.length > 0 ? currentPath : 'vakatime'
}

function resolveVakatimeInvocation(): VakatimeInvocation {
  const binPath = getVakatimeBinPath()
  if (/\.(?:js|mjs|cjs)$/i.test(binPath)) {
    return {
      commandString: `${quoteCommandPath(process.execPath)} ${quoteCommandPath(binPath)}`,
      spawnCommand: process.execPath,
      spawnArgsPrefix: [binPath],
    }
  }

  return {
    commandString: quoteCommandPath(binPath),
    spawnCommand: binPath,
    spawnArgsPrefix: [],
  }
}

/**
 * Build the shell command string that the agent will execute for a hook callback.
 *
 * Codex CLI 0.142.5+ on Windows invokes hook commands through sh/bash (MSYS),
 * which performs POSIX path translation on unquoted backslashes. A Windows path
 * like `C:\foo\bar.exe` is mangled to `C:foobar.exe` and the executable fails
 * to launch. We force interpretation through cmd.exe by wrapping the command
 * in `cmd /c '...'`: bash treats single-quoted strings as literal, and
 * cmd.exe treats single quotes as ordinary characters.
 *
 * Other agents (Claude Code, Gemini CLI) invoke hooks via mechanisms that
 * parse the command line natively on Windows (CreateProcess / JSON shim),
 * so the raw command works for them and we do not wrap.
 *
 * Pure: caller supplies the invocation and platform so tests can be deterministic.
 */
export function buildAgentHookCommand(
  invocation: VakatimeInvocation,
  source: AgentType,
  platform: NodeJS.Platform = process.platform,
): string {
  const base = `${invocation.commandString} hook --source ${source}`
  if (source === 'codex' && platform === 'win32') {
    // bash single-quote escape: a literal single quote inside '...' is
    // expressed by closing the string, adding an escaped quote, and reopening.
    const escaped = base.replace(/'/g, "'\\\''")
    return `cmd /c '${escaped}'`
  }
  return base
}

function commandForSource(source: AgentType): string {
  return buildAgentHookCommand(resolveVakatimeInvocation(), source)
}
function quoteCommandPath(path: string): string {
  if (/^vakatime(?:\.(?:exe|cmd))?$/i.test(basename(path))) return path
  return JSON.stringify(path)
}

function backupIfExists(path: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.backup`)
}

function readJsonObject(path: string): JsonRecord {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as JsonRecord) : {}
  } catch {
    copyFileSync(path, `${path}.backup`)
    return {}
  }
}

function isVakatimeCommand(command: unknown): command is string {
  return typeof command === 'string' && /\bvakatime(?:\.(?:exe|cmd))?\b/i.test(command) && command.includes('--source')
}

// True when the entry is one of OUR command hooks (claude-code / cursor /
// gemini-cli / codex style `{ type: 'command', command }`).
function isVakatimeCommandHook(hook: unknown): boolean {
  return isJsonObject(hook) && isVakatimeCommand(hook.command)
}

/**
 * Build the hook entry vakatime registers for ZCode.
 *
 * ZCode supports two hook types: `process` (argument vector, no shell — the
 * most portable) and `command` (shell string). When we were launched via
 * `node cli.js` we have a real executable + script path and use a `process`
 * hook. When launched through a global bin shim (`vakatime` / `vakatime.cmd`)
 * there is no bare executable to spawn on Windows (.cmd needs a shell), so we
 * fall back to a `command` hook and let ZCode's shell resolve it.
 *
 * Pure: caller supplies the invocation so tests can be deterministic.
 */
export function buildZcodeHookEntry(invocation: VakatimeInvocation): JsonRecord {
  if (invocation.spawnArgsPrefix.length > 0) {
    return {
      type: 'process',
      command: invocation.spawnCommand,
      args: [...invocation.spawnArgsPrefix, 'hook', '--source', 'zcode'],
      timeoutMs: 10000,
      statusMessage: 'Recording ZCode activity with Vakatime',
    }
  }
  return {
    type: 'command',
    command: `${invocation.commandString} hook --source zcode`,
    timeout: 10,
    statusMessage: 'Recording ZCode activity with Vakatime',
  }
}

// True when the entry is OUR ZCode hook, in either the `process` or the
// `command` form produced by buildZcodeHookEntry.
export function isVakatimeZcodeHook(hook: unknown): boolean {
  if (!isJsonObject(hook)) return false
  if (hook.type === 'process') {
    const args = hook.args
    if (!Array.isArray(args)) return false
    const sourceIndex = args.indexOf('--source')
    return args.includes('hook') && sourceIndex >= 0 && args[sourceIndex + 1] === 'zcode'
  }
  return hook.type === 'command' && isVakatimeCommand(hook.command) && String(hook.command).includes('zcode')
}

/**
 * Strip every hook matching `predicate` from a grouped event map
 * (`{ Event: [{ matcher?, hooks: [...] }] }` — claude-code / gemini-cli /
 * zcode shape). Empty groups and empty event keys are dropped. Non-array
 * values are preserved verbatim. Pure.
 */
export function stripVakatimeGroupedEvents(
  events: Record<string, unknown>,
  predicate: (hook: unknown) => boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(events)) {
    if (!Array.isArray(value)) {
      out[key] = value
      continue
    }
    const groups = value
      .map((group) =>
        isJsonObject(group) && Array.isArray(group.hooks)
          ? { ...group, hooks: (group.hooks as unknown[]).filter((hook) => !predicate(hook)) }
          : group,
      )
      .filter((group) => !(isJsonObject(group) && Array.isArray(group.hooks) && group.hooks.length === 0))
    if (groups.length > 0) out[key] = groups
  }
  return out
}

/**
 * Strip every entry matching `predicate` from a flat event map
 * (`{ Event: [{ command }] }` — cursor shape). Empty event keys are
 * dropped. Pure.
 */
export function stripVakatimeFlatEvents(
  events: Record<string, unknown>,
  predicate: (entry: unknown) => boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(events)) {
    if (!Array.isArray(value)) {
      out[key] = value
      continue
    }
    const kept = value.filter((entry) => !predicate(entry))
    if (kept.length > 0) out[key] = kept
  }
  return out
}

function installClaudeCode(): void {
  const settingsPath = homePath('.claude', 'settings.json')
  mkdirSync(dirname(settingsPath), { recursive: true })
  const settings = readJsonObject(settingsPath)
  backupIfExists(settingsPath)

  const hooks =
    settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks)
      ? (settings.hooks as Record<string, unknown[]>)
      : {}
  const events = ['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd']
  const command = commandForSource('claude-code')

  for (const event of events) {
    const arr = Array.isArray(hooks[event]) ? (hooks[event] as JsonRecord[]) : []
    const existing = arr.find((group) => group.matcher === '*')

    if (existing) {
      const groupHooks = Array.isArray(existing.hooks) ? (existing.hooks as JsonRecord[]) : []
      existing.hooks = groupHooks.some((hook) => isVakatimeCommand(hook.command))
        ? groupHooks.map((hook) => (isVakatimeCommand(hook.command) ? { ...hook, type: 'command', command } : hook))
        : [...groupHooks, { type: 'command', command }]
    } else {
      arr.push({ matcher: '*', hooks: [{ type: 'command', command }] })
    }

    hooks[event] = arr
  }

  settings.hooks = hooks
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  console.log(`Claude Code hooks configured in ${settingsPath}`)
}

const CODEX_FEATURE_MARKER = '# vakatime-managed'
const CODEX_MANAGED_SECTION_MARKER = '# vakatime-managed-section'
const CODEX_HOOKS_BLOCK_START = '# vakatime-managed-codex-hooks:start'
const CODEX_HOOKS_BLOCK_END = '# vakatime-managed-codex-hooks:end'

function quoteTomlString(value: string): string {
  return JSON.stringify(value)
}

function ensureCodexHooksEnabled(configContent: string): string {
  if (/^\s*hooks\s*=\s*true\b/m.test(configContent)) return configContent

  const managedTrueLine = `hooks = true ${CODEX_FEATURE_MARKER}`
  const falseFlagPattern = /^(\s*)hooks\s*=\s*false\b.*$/m
  if (falseFlagPattern.test(configContent)) {
    return configContent.replace(falseFlagPattern, `$1${managedTrueLine}: previous=false`)
  }

  if (configContent.includes('[features]')) {
    return configContent.replace(/\[features\]/, `[features]\n${managedTrueLine}`)
  }

  const prefix = configContent.length > 0 && !configContent.endsWith('\n') ? '\n' : ''
  return `${configContent}${prefix}\n[features]\n${CODEX_MANAGED_SECTION_MARKER}\n${managedTrueLine}\n`
}

/**
 * Reverse of ensureCodexHooksEnabled for `vakatime remove codex`. Only lines
 * carrying our markers are touched; a user's own unmarked `hooks = true`
 * survives. Three install shapes, three reverts:
 *   A. we appended a whole `[features]` section  → remove the section
 *   B. we flipped `hooks = false`                → flip it back
 *   C. we inserted a line into an existing table → remove the line
 * Pure.
 */
export function revertCodexHooksEnabled(configContent: string): string {
  // A: the exact section ensureCodexHooksEnabled appends on a bare config.
  const sectionPattern = new RegExp(
    `\\n?\\[features\\]\\n${CODEX_MANAGED_SECTION_MARKER}\\n\\s*hooks = true ${CODEX_FEATURE_MARKER}[^\\n]*\\n?`,
    'm',
  )
  if (sectionPattern.test(configContent)) {
    return configContent.replace(sectionPattern, '')
  }

  // B: we replaced a `hooks = false` line — restore it.
  const flippedPattern = new RegExp(`^(\\s*)hooks = true ${CODEX_FEATURE_MARKER}: previous=false[^\\n]*$`, 'm')
  if (flippedPattern.test(configContent)) {
    return configContent.replace(flippedPattern, '$1hooks = false')
  }

  // C: we inserted a managed line into an existing `[features]` table.
  // Consume the whole line INCLUDING its trailing newline so no blank line
  // remains (horizontal whitespace only — `\s` would swallow newlines).
  const insertedPattern = new RegExp(`^[ \\t]*hooks = true ${CODEX_FEATURE_MARKER}[ \\t]*\\r?\\n`, 'm')
  return configContent.replace(insertedPattern, '')
}

function buildCodexInlineHooksBlock(command: string): string {
  const quotedCommand = quoteTomlString(command)
  const blocks = CODEX_HOOK_EVENTS.map(
    (event) => `[[hooks.${event}]]
[[hooks.${event}.hooks]]
type = "command"
command = ${quotedCommand}
timeout = 10
statusMessage = "Recording Codex activity with Vakatime"`,
  )

  return `${CODEX_HOOKS_BLOCK_START}\n${blocks.join('\n\n')}\n${CODEX_HOOKS_BLOCK_END}`
}

function removeManagedCodexInlineHooksBlock(configContent: string): string {
  const pattern = new RegExp(`\\n?${CODEX_HOOKS_BLOCK_START}\\n[\\s\\S]*?\\n${CODEX_HOOKS_BLOCK_END}\\n?`, 'm')
  return configContent.replace(pattern, (match) => {
    const body = match
      .replace(new RegExp(`^\\n?${CODEX_HOOKS_BLOCK_START}\\n?`), '')
      .replace(new RegExp(`\\n?${CODEX_HOOKS_BLOCK_END}\\n?$`), '')
    const eventAlternation = CODEX_HOOK_EVENTS.join('|')
    const managedEventPattern = new RegExp(
      `\\n?\\[\\[hooks\\.(${eventAlternation})\\]\\][\\s\\S]*?(?=\\n\\[\\[(?!hooks\\.(?:${eventAlternation})\\.hooks\\]\\])|\\n\\[(?!\\[)|$)`,
      'g',
    )
    const preserved = body.replace(managedEventPattern, '').trim()

    if (preserved.length === 0) return match.startsWith('\n') && match.endsWith('\n') ? '\n' : ''

    const prefix = match.startsWith('\n') ? '\n' : ''
    const suffix = match.endsWith('\n') ? '\n' : ''
    return `${prefix}${preserved}${suffix}`
  })
}

function ensureCodexInlineHooks(configContent: string, command: string): string {
  const withoutManagedBlock = removeManagedCodexInlineHooksBlock(configContent)
  const block = buildCodexInlineHooksBlock(command)
  const separator = withoutManagedBlock.length === 0 ? '' : withoutManagedBlock.endsWith('\n') ? '' : '\n'
  return `${withoutManagedBlock}${separator}${block}\n`
}

function removeLegacyCodexJsonHooks(): void {
  const hooksPath = homePath('.codex', 'hooks.json')
  if (!existsSync(hooksPath)) return

  const hooksData = readJsonObject(hooksPath)
  const hooks =
    hooksData.hooks && typeof hooksData.hooks === 'object' && !Array.isArray(hooksData.hooks)
      ? (hooksData.hooks as Record<string, unknown[]>)
      : null
  if (!hooks) return

  let changed = false
  for (const event of CODEX_HOOK_EVENTS) {
    const arr = Array.isArray(hooks[event]) ? (hooks[event] as JsonRecord[]) : []
    const nextGroups = arr
      .map((group) => {
        const groupHooks = Array.isArray(group.hooks) ? (group.hooks as JsonRecord[]) : []
        const nextHooks = groupHooks.filter((hook) => !isVakatimeCommand(hook.command))
        if (nextHooks.length !== groupHooks.length) changed = true
        return { ...group, hooks: nextHooks }
      })
      .filter((group) => Array.isArray(group.hooks) && group.hooks.length > 0)

    if (nextGroups.length > 0) {
      hooks[event] = nextGroups
    } else if (arr.length > 0) {
      delete hooks[event]
      changed = true
    }
  }

  if (!changed) return
  hooksData.hooks = hooks
  backupIfExists(hooksPath)
  writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2) + '\n')
}

function installCodex(): void {
  const configPath = homePath('.codex', 'config.toml')
  mkdirSync(dirname(configPath), { recursive: true })

  const configContent = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : ''
  const command = commandForSource('codex')
  const enabledConfigContent = ensureCodexHooksEnabled(configContent)
  const nextConfigContent = ensureCodexInlineHooks(enabledConfigContent, command)

  if (nextConfigContent !== configContent) {
    backupIfExists(configPath)
    writeFileSync(configPath, nextConfigContent)
  }

  removeLegacyCodexJsonHooks()
  console.log(`Codex hooks configured in ${configPath}`)
}
function opencodeConfigDir(): string {
  const configured = process.env.OPENCODE_CONFIG_DIR?.trim()
  return configured && configured.length > 0 ? configured : homePath('.config', 'opencode')
}

function buildOpenCodePlugin(invocation: VakatimeInvocation): string {
  const commandLiteral = JSON.stringify(invocation.spawnCommand)
  const argsPrefixLiteral = JSON.stringify(invocation.spawnArgsPrefix)
  return `// Vakatime managed OpenCode plugin. Do not edit by hand.
// Reinstall with \`vakatime setup opencode\` if this file is changed.

const command = ${commandLiteral}
const argsPrefix = ${argsPrefixLiteral}
const emitted = new Set()

function props(event) {
  return event?.properties ?? event?.data ?? event ?? {}
}

function infoOf(input) {
  return input?.info ?? input?.message ?? null
}

function eventName(event) {
  return event?.type ?? event?.name ?? event?.event ?? ''
}

function sessionID(input, info) {
  return input.sessionID ?? input.sessionId ?? input.session_id ?? info?.sessionID ?? info?.session_id ?? info?.id
}

function cwd(input, info, context) {
  return input.cwd ?? input.directory ?? info?.path?.cwd ?? info?.directory ?? context.directory ?? context.worktree ?? ''
}

function hasCompletedTimestamp(info) {
  return typeof info?.time?.completed === 'number' && Number.isFinite(info.time.completed)
}

function messageId(info) {
  return typeof info?.id === 'string' && info.id.length > 0 ? info.id : ''
}

function parentId(info) {
  return typeof info?.parentID === 'string' && info.parentID.length > 0
    ? info.parentID
    : typeof info?.parent_id === 'string' && info.parent_id.length > 0
      ? info.parent_id
      : ''
}

function messageDone(info) {
  return Boolean(
    (info?.error && typeof info.error === 'object' && !Array.isArray(info.error)) ||
      (info?.finish &&
        info.finish !== 'tool-calls' &&
        info.finish !== 'unknown' &&
        hasCompletedTimestamp(info)),
  )
}

function shouldSend(name, _input, info) {
  if (name === 'session.created' || name === 'session.deleted') return true
  if (name !== 'message.updated') return false
  if (!info || (info.role !== 'user' && info.role !== 'assistant')) return false
  return info.role === 'user' ? Boolean(messageId(info)) : Boolean(parentId(info) && messageDone(info))
}

function sanitizedInfo(info) {
  if (!info || typeof info !== 'object') return null
  const time = info.time && typeof info.time === 'object' ? info.time : {}
  const model = info.model && typeof info.model === 'object' ? info.model : undefined
  const path = info.path && typeof info.path === 'object' ? info.path : undefined
  return {
    id: messageId(info) || undefined,
    sessionID: info.sessionID ?? info.session_id,
    role: info.role,
    parentID: parentId(info) || undefined,
    finish: info.finish,
    error: info.error ? {} : undefined,
    model,
    modelID: info.modelID,
    path: path ? { cwd: path.cwd } : undefined,
    directory: info.directory,
    time: {
      created: time.created,
      updated: time.updated,
      completed: time.completed,
    },
  }
}

async function send(event, context) {
  const name = eventName(event)
  const input = props(event)
  const info = infoOf(input)

  if (!shouldSend(name, input, info)) return

  if (name === 'message.updated') {
    const id = info.role === 'assistant' ? parentId(info) : messageId(info)
    const dedupeKey = info.role === 'assistant' ? \`\${name}:\${id}:done\` : \`\${name}:\${id}:start\`
    if (emitted.has(dedupeKey)) return
    emitted.add(dedupeKey)
  }

  const payload = {
    event: name,
    hook_event_name: name,
    sessionID: sessionID(input, info),
    cwd: cwd(input, info, context),
    directory: context.directory,
    worktree: context.worktree,
    info: sanitizedInfo(info),
    timestamp: Date.now(),
  }

  try {
    const child = Bun.spawn([command, ...argsPrefix, 'hook', '--source', 'opencode'], {
      env: process.env,
      stdin: 'pipe',
      stdout: 'ignore',
      stderr: 'ignore',
    })
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  } catch {
    // Hooks must never disrupt OpenCode UX.
  }
}

export async function Vakatime(input) {
  return {
    event: async ({ event }) => send(event, input),
  }
}
`
}

function installOpenCode(): void {
  const pluginPath = join(opencodeConfigDir(), 'plugins', OPENCODE_PLUGIN_NAME)
  mkdirSync(dirname(pluginPath), { recursive: true })
  backupIfExists(pluginPath)
  const content = buildOpenCodePlugin(resolveVakatimeInvocation())
  if (!existsSync(pluginPath) || readFileSync(pluginPath, 'utf-8') !== content) {
    writeFileSync(pluginPath, content)
  }
  console.log(`OpenCode plugin configured in ${pluginPath}`)
}


function installCursor(): void {
  const hooksPath = homePath('.cursor', 'hooks.json')
  mkdirSync(dirname(hooksPath), { recursive: true })
  const hooksData = readJsonObject(hooksPath)
  backupIfExists(hooksPath)

  const hooks =
    hooksData.hooks && typeof hooksData.hooks === 'object' && !Array.isArray(hooksData.hooks)
      ? (hooksData.hooks as Record<string, unknown[]>)
      : {}
  const events = ['beforeSubmitPrompt', 'stop', 'sessionStart', 'sessionEnd']
  const command = commandForSource('cursor')

  for (const event of events) {
    const arr = Array.isArray(hooks[event]) ? (hooks[event] as JsonRecord[]) : []
    const hasVakatime = arr.some((hook) => isVakatimeCommand(hook.command))
    hooks[event] = hasVakatime
      ? arr.map((hook) => (isVakatimeCommand(hook.command) ? { ...hook, command } : hook))
      : [...arr, { command }]
  }

  hooksData.version = hooksData.version ?? 1
  hooksData.hooks = hooks
  writeFileSync(hooksPath, `${JSON.stringify(hooksData, null, 2)}\n`)
  console.log(`Cursor hooks configured in ${hooksPath}`)
}
function installGeminiCli(): void {
  const settingsPath = homePath('.gemini', 'settings.json')
  mkdirSync(dirname(settingsPath), { recursive: true })
  const settings = readJsonObject(settingsPath)
  backupIfExists(settingsPath)

  const hooks =
    settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks)
      ? (settings.hooks as Record<string, unknown[]>)
      : {}
  const events = ['SessionStart', 'UserPromptSubmit', 'Stop']
  const command = commandForSource('gemini-cli')

  for (const event of events) {
    const arr = Array.isArray(hooks[event]) ? (hooks[event] as JsonRecord[]) : []
    const existing = arr.find((group) => group.matcher === '*')
    if (existing) {
      const groupHooks = Array.isArray(existing.hooks) ? (existing.hooks as JsonRecord[]) : []
      existing.hooks = groupHooks.some((hook) => isVakatimeCommand(hook.command))
        ? groupHooks.map((hook) => (isVakatimeCommand(hook.command) ? { ...hook, type: 'command', command, timeout: 10000 } : hook))
        : [...groupHooks, { name: 'vakatime', type: 'command', command, timeout: 10000 }]
    } else {
      arr.push({ matcher: '*', hooks: [{ name: 'vakatime', type: 'command', command, timeout: 10000 }] })
    }
    hooks[event] = arr
  }

  settings.hooks = hooks
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  console.log(`Gemini CLI hooks configured in ${settingsPath}`)
}

function installZcode(): void {
  const configPath = homePath('.zcode', 'cli', 'config.json')
  mkdirSync(dirname(configPath), { recursive: true })
  const config = readJsonObject(configPath)
  backupIfExists(configPath)

  const hooks = isJsonObject(config.hooks) ? config.hooks : {}
  const events = isJsonObject(hooks.events) ? hooks.events : {}

  // Idempotent: strip any previous vakatime entries first, then append a
  // fresh group per event. No matcher — we want every occurrence.
  const stripped = stripVakatimeGroupedEvents(events, isVakatimeZcodeHook)
  for (const event of ZCODE_HOOK_EVENTS) {
    const arr = Array.isArray(stripped[event]) ? (stripped[event] as JsonRecord[]) : []
    stripped[event] = [...arr, { hooks: [buildZcodeHookEntry(resolveVakatimeInvocation())] }]
  }

  hooks.events = stripped
  // ZCode disables configuration-file hooks unless explicitly enabled.
  hooks.enabled = true
  config.hooks = hooks
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  console.log(`ZCode hooks configured in ${configPath}`)
}

function removeClaudeCode(): void {
  const settingsPath = homePath('.claude', 'settings.json')
  const settings = readJsonObject(settingsPath)
  if (!isJsonObject(settings.hooks)) return

  const next = stripVakatimeGroupedEvents(settings.hooks, isVakatimeCommandHook)
  if (JSON.stringify(next) === JSON.stringify(settings.hooks)) return

  backupIfExists(settingsPath)
  settings.hooks = next
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  console.log(`Claude Code hooks removed from ${settingsPath}`)
}

function removeCodex(): void {
  const configPath = homePath('.codex', 'config.toml')
  removeLegacyCodexJsonHooks()

  if (!existsSync(configPath)) return
  const configContent = readFileSync(configPath, 'utf-8')
  const nextContent = revertCodexHooksEnabled(removeManagedCodexInlineHooksBlock(configContent))
  if (nextContent === configContent) return

  backupIfExists(configPath)
  writeFileSync(configPath, nextContent)
  console.log(`Codex hooks removed from ${configPath}`)
}

function removeCursor(): void {
  const hooksPath = homePath('.cursor', 'hooks.json')
  const hooksData = readJsonObject(hooksPath)
  if (!isJsonObject(hooksData.hooks)) return

  const next = stripVakatimeFlatEvents(hooksData.hooks, (entry) => isVakatimeCommandHook(entry))
  if (JSON.stringify(next) === JSON.stringify(hooksData.hooks)) return

  backupIfExists(hooksPath)
  hooksData.hooks = next
  writeFileSync(hooksPath, `${JSON.stringify(hooksData, null, 2)}\n`)
  console.log(`Cursor hooks removed from ${hooksPath}`)
}

function removeGeminiCli(): void {
  const settingsPath = homePath('.gemini', 'settings.json')
  const settings = readJsonObject(settingsPath)
  if (!isJsonObject(settings.hooks)) return

  const next = stripVakatimeGroupedEvents(settings.hooks, isVakatimeCommandHook)
  if (JSON.stringify(next) === JSON.stringify(settings.hooks)) return

  backupIfExists(settingsPath)
  settings.hooks = next
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  console.log(`Gemini CLI hooks removed from ${settingsPath}`)
}

function removeOpenCode(): void {
  const pluginPath = join(opencodeConfigDir(), 'plugins', OPENCODE_PLUGIN_NAME)
  if (!existsSync(pluginPath)) return

  rmSync(pluginPath)
  console.log(`OpenCode plugin removed: ${pluginPath}`)
}

function removeZcode(): void {
  const configPath = homePath('.zcode', 'cli', 'config.json')
  const config = readJsonObject(configPath)
  if (!isJsonObject(config.hooks) || !isJsonObject(config.hooks.events)) return

  const next = stripVakatimeGroupedEvents(config.hooks.events, isVakatimeZcodeHook)
  if (JSON.stringify(next) === JSON.stringify(config.hooks.events)) return

  backupIfExists(configPath)
  config.hooks.events = next
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  console.log(`ZCode hooks removed from ${configPath}`)
}

export function setupAgent(agent: AgentType): void {
  switch (agent) {
    case 'claude-code':
      installClaudeCode()
      break
    case 'codex':
      installCodex()
      break
    case 'cursor':
      installCursor()
      break
    case 'opencode':
      installOpenCode()
      break
    case 'gemini-cli':
      installGeminiCli()
      break
    case 'zcode':
      installZcode()
      break
  }

  console.log(`\nSetup complete for ${agent}. It will now report usage data to Vakatime.`)
}

/**
 * Remove every hook vakatime registered for `agent` in that agent's native
 * configuration. Other hooks (the user's own or from other tools) are left
 * untouched; a `.backup` copy is written before each modified file changes.
 */
export function removeAgent(agent: AgentType): void {
  switch (agent) {
    case 'claude-code':
      removeClaudeCode()
      break
    case 'codex':
      removeCodex()
      break
    case 'cursor':
      removeCursor()
      break
    case 'opencode':
      removeOpenCode()
      break
    case 'gemini-cli':
      removeGeminiCli()
      break
    case 'zcode':
      removeZcode()
      break
  }

  console.log(`\nRemoval complete for ${agent}. It will no longer report usage data to Vakatime.`)
}

export function listSupportedAgents(): string[] {
  return ['claude-code', 'codex', 'cursor', 'opencode', 'gemini-cli', 'zcode']
}
