// ZCode adapter. Pure logic. No imports beyond `events.ts` types.
//
// Payload verified against ZCode's hook runtime (zcode.cjs, LPn/XRo): the
// stdin JSON is a Claude-Code-compatible base plus camelCase extras:
//
//   { ...event, agent_type, hook_event_name, permission_mode, session_id,
//     transcript_path, transcriptPath,
//     [tool_name/tool_input/tool_use_id]                      // tool events
//     last_assistant_message, stop_hook_active }              // Stop
//
// Event objects carry: cwd, sessionId, turnId (turn events), prompt
// (UserPromptSubmit), model + source (SessionStart). ZCode supports exactly
// seven events (SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest,
// PostToolUse, PostToolUseFailure, Stop) — there is NO SessionEnd, so this
// adapter maps three events only. Same situation as the Codex adapter.

import type { AdapterFn, EventType, NormalizedEvent } from '../events.js'

// Per-vendor event-name → event_type lookup. ZCode has no SessionEnd.
const EVENT_TYPES: Readonly<Record<string, EventType>> = {
  UserPromptSubmit: 'turn_start',
  Stop: 'turn_end',
  SessionStart: 'session_start',
}

function hasRequired(p: unknown): p is { session_id: string; cwd: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { session_id?: unknown }).session_id === 'string' &&
    typeof (p as { cwd?: unknown }).cwd === 'string'
  )
}

// ZCode provides `turnId` natively on turn events (verified in the hook
// runtime call sites). Accept the snake_case spelling too, then fall back to
// the Claude-Code style derivation so nothing is lost on older builds.
function turnIdOf(p: { session_id: string }, ts: number): string {
  const turnId = (p as { turnId?: unknown }).turnId
  if (typeof turnId === 'string' && turnId.length > 0) return turnId
  const turn_id = (p as { turn_id?: unknown }).turn_id
  if (typeof turn_id === 'string' && turn_id.length > 0) return turn_id
  return `${p.session_id}-${ts}`
}

/**
 * ZCode adapter.
 *
 * Maps `UserPromptSubmit` / `Stop` / `SessionStart` only — ZCode does not
 * emit SessionEnd (seven supported events, verified against the runtime).
 * `turn_id` comes from the vendor-provided `turnId` when present.
 *
 * Meta whitelist: model + source on session_start. Drop prompt /
 * last_assistant_message / permission_mode / transcript_path / traceId —
 * not needed by the schema and may carry sensitive content.
 *
 * Pure. Never throws. Returns `null` on unparseable / unmapped input.
 */
export const adaptZcode: AdapterFn = (rawPayload, eventName) => {
  // Same never-throws belt-and-braces as the other adapters.
  try {
    const event_type = EVENT_TYPES[eventName]
    if (!event_type) return null

    if (!hasRequired(rawPayload)) return null

    // ts at call time — NOT module scope.
    const ts = Date.now() / 1000
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    const isTurn = event_type === 'turn_start' || event_type === 'turn_end'
    const turn_id = isTurn ? turnIdOf(rawPayload, ts) : undefined

    const meta: Record<string, unknown> = {}
    if (event_type === 'session_start') {
      const model = (rawPayload as { model?: unknown }).model
      if (typeof model === 'string') meta.model = model
      const source = (rawPayload as { source?: unknown }).source
      if (typeof source === 'string') meta.source = source
    }

    const event: NormalizedEvent = {
      agent: 'zcode',
      event_type,
      project: rawPayload.cwd,
      session_id: rawPayload.session_id,
      ts,
      timezone,
      ...(turn_id !== undefined ? { turn_id } : {}),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }
    return event
  } catch {
    return null
  }
}
