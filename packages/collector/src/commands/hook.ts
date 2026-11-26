// Hook hot path — spawned by agents on every event. This module MUST NOT
// import ink/react/commander transitively; it only pulls node builtins,
// config/upload and the core adapters.
import type { HookSource } from '../hook.js'
import { adaptHookPayload, readStdinJson } from '../hook.js'
import { appendHookLog, payloadSummary, uploadOrQueue } from './shared.js'

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name)
  return index >= 0 ? (args[index + 1] ?? null) : null
}

export const HOOK_SOURCES = ['codex', 'claude-code', 'cursor', 'opencode', 'gemini-cli', 'zcode'] as const

async function runHook(argv: string[]): Promise<void> {
  const rawSource = option(argv, '--source')
  const source = rawSource === 'claude' ? 'claude-code' : rawSource
  if (source === null || source === undefined || !(HOOK_SOURCES as readonly string[]).includes(source)) {
    throw new Error(`--source must be one of: ${HOOK_SOURCES.join(', ')} (claude is an alias for claude-code)`)
  }
  const hookSource = source as HookSource

  appendHookLog({ phase: 'hook-start', source, argv })
  const payload = await readStdinJson()
  if (!payload) {
    appendHookLog({ phase: 'stdin', source, status: 'empty' })
    return
  }

  appendHookLog({ phase: 'stdin', source, status: 'parsed', payload: payloadSummary(payload) })
  const heartbeat = adaptHookPayload(hookSource, payload)
  if (!heartbeat) {
    appendHookLog({ phase: 'adapt', source, status: 'ignored', payload: payloadSummary(payload) })
    return
  }

  appendHookLog({ phase: 'adapt', source, status: 'ok', heartbeat })
  await uploadOrQueue(heartbeat)
}

/**
 * Entry for both `vakatime hook --source <agent>` and the legacy shorthand
 * `vakatime --source <agent>`. Never throws: errors are printed and turned
 * into exit code 1 so a broken hook degrades the agent UX as little as
 * possible.
 */
export async function runHookCommand(argv: string[]): Promise<void> {
  try {
    await runHook(argv)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}
