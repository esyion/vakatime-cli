import type { AdapterFn, EventType, NormalizedEvent } from '../events.js'

type JsonRecord = Record<string, unknown>

const EVENT_TYPES: Readonly<Record<string, EventType>> = {
  'session.created': 'session_start',
  'session.deleted': 'session_end',
  'message.updated:user': 'turn_start',
  'message.updated:assistant': 'turn_end',
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function millisecondsToSeconds(value: number): number {
  return value > 10_000_000_000 ? value / 1000 : value
}

function parseTimestamp(...values: unknown[]): number {
  for (const value of values) {
    const number = asNumber(value)
    if (number !== null) return millisecondsToSeconds(number)
    const string = asString(value)
    if (!string) continue
    const parsed = Date.parse(string)
    if (Number.isFinite(parsed)) return parsed / 1000
  }
  return Date.now() / 1000
}

function messageInfo(rawPayload: unknown): JsonRecord | null {
  const payload = asObject(rawPayload)
  return asObject(payload?.info) ?? asObject(payload?.message) ?? null
}

function eventKey(rawPayload: unknown, eventName: string): string | null {
  if (eventName !== 'message.updated') return eventName
  const info = messageInfo(rawPayload)
  const role = asString(info?.role)
  if (role === 'user') return 'message.updated:user'
  if (role === 'assistant') {
    const finish = asString(info?.finish)
    const error = asObject(info?.error)
    const time = asObject(info?.time)
    const completed = asNumber(time?.completed) !== null
    if (error || (finish && finish !== 'tool-calls' && finish !== 'unknown' && completed)) {
      return 'message.updated:assistant'
    }
  }
  return null
}

function sessionId(rawPayload: unknown, info: JsonRecord | null): string | null {
  const payload = asObject(rawPayload)
  return (
    asString(payload?.session_id) ??
    asString(payload?.sessionID) ??
    asString(payload?.sessionId) ??
    asString(info?.sessionID) ??
    asString(info?.session_id) ??
    asString(info?.id)
  )
}

function cwd(rawPayload: unknown, info: JsonRecord | null): string | null {
  const payload = asObject(rawPayload)
  const path = asObject(info?.path)
  return (
    asString(payload?.cwd) ??
    asString(payload?.directory) ??
    asString(path?.cwd) ??
    asString(info?.directory)
  )
}

function modelName(info: JsonRecord | null): string | null {
  const model = asObject(info?.model)
  const providerID = asString(model?.providerID)
  const modelID = asString(model?.modelID) ?? asString(model?.id)
  if (providerID && modelID) return `${providerID}/${modelID}`
  return modelID ?? asString(info?.modelID)
}

/**
 * OpenCode plugin-event adapter.
 *
 * OpenCode exposes lifecycle data to plugins through a generic `event` hook.
 * VibeTime's installed plugin forwards only event metadata, never prompt text:
 *   - `session.created` -> `session_start`
 *   - `message.updated` user message -> `turn_start`
 *   - final assistant `message.updated` -> `turn_end`
 *   - `session.deleted` -> `session_end`
 *
 * OpenCode can emit several assistant messages for a single user prompt while
 * tool calls are running. Those intermediate `finish: "tool-calls"` messages
 * and `finish: "unknown"` updates are part of the same user turn and must not close it.
 * Terminal finishes can also appear before `time.completed`, so VibeTime waits
 * for the completed timestamp before closing the turn.
 *
 * `turn_id` is the OpenCode user message id for starts and the assistant
 * `parentID` for ends, allowing usage rows to reconcile by turn.
 */
export const adaptOpenCode: AdapterFn = (rawPayload, eventName) => {
  try {
    const key = eventKey(rawPayload, eventName)
    const event_type = key ? EVENT_TYPES[key] : undefined
    if (!event_type) return null

    const info = messageInfo(rawPayload) ?? asObject(asObject(rawPayload)?.info)
    const sid = sessionId(rawPayload, info)
    const project = cwd(rawPayload, info)
    if (!sid || !project) return null

    const time = asObject(info?.time)
    const ts = parseTimestamp(
      event_type === 'turn_end' ? time?.completed : null,
      time?.updated,
      time?.created,
      asObject(rawPayload)?.timestamp,
    )

    const turn_id =
      event_type === 'turn_start'
        ? (asString(info?.id) ?? undefined)
        : event_type === 'turn_end'
          ? (asString(info?.parentID) ?? asString(info?.parent_id) ?? undefined)
          : undefined
    if ((event_type === 'turn_start' || event_type === 'turn_end') && !turn_id) return null

    const meta: Record<string, unknown> = {}
    const model = modelName(info)
    if (model && (event_type === 'session_start' || event_type === 'turn_start')) {
      meta.model = model
    }
    if (event_type === 'session_end') {
      meta.reason = eventName === 'session.deleted' ? 'deleted' : eventName
    }

    const event: NormalizedEvent = {
      agent: 'opencode',
      event_type,
      project,
      session_id: sid,
      ts,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(turn_id !== undefined ? { turn_id } : {}),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }
    return event
  } catch {
    return null
  }
}
