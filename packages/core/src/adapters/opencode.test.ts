import { describe, expect, it } from 'vitest'
import { adaptOpenCode } from './opencode.js'

describe('adaptOpenCode', () => {
  it('maps session.created to session_start', () => {
    const event = adaptOpenCode(
      {
        event: 'session.created',
        cwd: '/Users/barry/project',
        info: {
          id: 'ses_1',
          directory: '/Users/barry/project',
          time: { created: 1779257000000 },
          model: { providerID: 'openai', modelID: 'gpt-5.1' },
        },
      },
      'session.created',
    )

    expect(event).toMatchObject({
      agent: 'opencode',
      event_type: 'session_start',
      project: '/Users/barry/project',
      session_id: 'ses_1',
      ts: 1779257000,
    })
  })

  it('maps user message.updated to turn_start with message id as turn_id', () => {
    const event = adaptOpenCode(
      {
        cwd: '/repo',
        info: {
          id: 'msg_user',
          sessionID: 'ses_1',
          role: 'user',
          time: { created: 1779257001000 },
          model: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
        },
      },
      'message.updated',
    )

    expect(event).toMatchObject({
      agent: 'opencode',
      event_type: 'turn_start',
      session_id: 'ses_1',
      turn_id: 'msg_user',
      meta: { model: 'anthropic/claude-sonnet-4-5' },
    })
  })

  it('maps completed assistant message.updated to turn_end using parentID as turn_id', () => {
    const event = adaptOpenCode(
      {
        cwd: '/repo',
        info: {
          id: 'msg_assistant',
          sessionID: 'ses_1',
          role: 'assistant',
          parentID: 'msg_user',
          finish: 'stop',
          time: { created: 1779257002000, completed: 1779257015000 },
        },
      },
      'message.updated',
    )

    expect(event).toMatchObject({
      agent: 'opencode',
      event_type: 'turn_end',
      session_id: 'ses_1',
      turn_id: 'msg_user',
      ts: 1779257015,
    })
  })

  it('ignores intermediate assistant tool-call messages for the same user turn', () => {
    const event = adaptOpenCode(
      {
        cwd: '/repo',
        info: {
          id: 'msg_assistant_tool',
          sessionID: 'ses_1',
          role: 'assistant',
          parentID: 'msg_user',
          finish: 'tool-calls',
          time: { created: 1779257002000, completed: 1779257015000 },
        },
      },
      'message.updated',
    )

    expect(event).toBeNull()
  })

  it('ignores unknown assistant finish messages for the same user turn', () => {
    const event = adaptOpenCode(
      {
        cwd: '/repo',
        info: {
          id: 'msg_assistant_unknown',
          sessionID: 'ses_1',
          role: 'assistant',
          parentID: 'msg_user',
          finish: 'unknown',
          time: { created: 1779257002000, completed: 1779257015000 },
        },
      },
      'message.updated',
    )

    expect(event).toBeNull()
  })

  it('waits for terminal assistant messages to have a completed timestamp', () => {
    const event = adaptOpenCode(
      {
        cwd: '/repo',
        info: {
          id: 'msg_assistant_final',
          sessionID: 'ses_1',
          role: 'assistant',
          parentID: 'msg_user',
          finish: 'stop',
          time: { created: 1779257002000 },
        },
      },
      'message.updated',
    )

    expect(event).toBeNull()
  })

  it('requires completed assistant timestamps to be numeric', () => {
    const event = adaptOpenCode(
      {
        cwd: '/repo',
        info: {
          id: 'msg_assistant_string_completed',
          sessionID: 'ses_1',
          role: 'assistant',
          parentID: 'msg_user',
          finish: 'stop',
          time: { created: 1779257002000, completed: '2026-05-20T08:00:00.000Z' },
        },
      },
      'message.updated',
    )

    expect(event).toBeNull()
  })

  it('requires OpenCode turn events to have explicit turn identifiers', () => {
    expect(
      adaptOpenCode(
        {
          cwd: '/repo',
          info: {
            sessionID: 'ses_1',
            role: 'user',
            time: { created: 1779257002000 },
          },
        },
        'message.updated',
      ),
    ).toBeNull()

    expect(
      adaptOpenCode(
        {
          cwd: '/repo',
          info: {
            id: 'msg_assistant',
            sessionID: 'ses_1',
            role: 'assistant',
            finish: 'stop',
            time: { created: 1779257002000, completed: 1779257015000 },
          },
        },
        'message.updated',
      ),
    ).toBeNull()
  })

  it('ignores streaming assistant updates that have not completed', () => {
    expect(
      adaptOpenCode(
        {
          cwd: '/repo',
          info: { id: 'a', sessionID: 's', role: 'assistant', parentID: 'u', time: {} },
        },
        'message.updated',
      ),
    ).toBeNull()
  })

  it('never throws on malformed input', () => {
    expect(() => adaptOpenCode(null, 'message.updated')).not.toThrow()
    expect(adaptOpenCode(null, 'message.updated')).toBeNull()
  })
})
