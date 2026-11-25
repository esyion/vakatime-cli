import { describe, expect, it } from 'vitest'
import { adaptZcode } from './zcode.js'

// Payload shape verified against ZCode's hook runtime: Claude-Code-compatible
// base (session_id, cwd, hook_event_name) plus camelCase extras (turnId,
// source, model, timestamp, traceId, agentName...).
const base = {
  session_id: 'sess_abc123',
  cwd: 'D:\\workspace\\vakatime',
  permission_mode: 'default',
  transcript_path: 'C:\\Temp\\zcode-hook-x\\transcript.jsonl',
  transcriptPath: 'C:\\Temp\\zcode-hook-x\\transcript.jsonl',
  agent_type: 'ZCode',
  timestamp: '2026-11-25T08:00:00.000Z',
  traceId: 'tr-1',
}

describe('adaptZcode', () => {
  it('maps UserPromptSubmit to turn_start with vendor turnId', () => {
    const event = adaptZcode({ ...base, prompt: 'hi', turnId: 'turn_42' }, 'UserPromptSubmit')
    expect(event).toMatchObject({
      agent: 'zcode',
      event_type: 'turn_start',
      session_id: 'sess_abc123',
      turn_id: 'turn_42',
      project: 'D:\\workspace\\vakatime',
    })
  })

  it('maps Stop to turn_end and drops last_assistant_message', () => {
    const event = adaptZcode(
      { ...base, turnId: 'turn_42', stop_hook_active: false, last_assistant_message: 'secret' },
      'Stop',
    )
    expect(event).toMatchObject({ agent: 'zcode', event_type: 'turn_end', turn_id: 'turn_42' })
    expect(event?.meta?.last_assistant_message).toBeUndefined()
  })

  it('maps SessionStart and whitelists model + source into meta', () => {
    const event = adaptZcode(
      { ...base, source: 'startup', model: 'zhipu/glm-4.7' },
      'SessionStart',
    )
    expect(event).toMatchObject({
      agent: 'zcode',
      event_type: 'session_start',
      meta: { model: 'zhipu/glm-4.7', source: 'startup' },
    })
    expect(event?.turn_id).toBeUndefined()
  })

  it('derives turn_id from session_id + ts when turnId is absent', () => {
    const event = adaptZcode({ ...base, prompt: 'hi' }, 'UserPromptSubmit')
    expect(event?.turn_id).toMatch(/^sess_abc123-\d+(\.\d+)?$/)
  })

  it('accepts snake_case turn_id as a fallback', () => {
    const event = adaptZcode({ ...base, turn_id: 'turn_7' }, 'Stop')
    expect(event?.turn_id).toBe('turn_7')
  })

  it('returns null for unsupported events (ZCode has no SessionEnd)', () => {
    expect(adaptZcode({ ...base }, 'SessionEnd')).toBeNull()
    expect(adaptZcode({ ...base }, 'PreToolUse')).toBeNull()
    expect(adaptZcode({ ...base }, 'PostToolUse')).toBeNull()
    expect(adaptZcode({ ...base }, 'PermissionRequest')).toBeNull()
  })

  it('returns null when required fields are missing or mistyped', () => {
    expect(adaptZcode({ cwd: 'x' }, 'SessionStart')).toBeNull()
    expect(adaptZcode({ session_id: 's' }, 'SessionStart')).toBeNull()
    expect(adaptZcode({ session_id: 1, cwd: 'x' }, 'SessionStart')).toBeNull()
    expect(adaptZcode(null, 'SessionStart')).toBeNull()
    expect(adaptZcode('string', 'Stop')).toBeNull()
  })

  it('never throws on malformed input', () => {
    expect(adaptZcode(undefined, 'SessionStart')).toBeNull()
    expect(adaptZcode([], 'Stop')).toBeNull()
  })
})
