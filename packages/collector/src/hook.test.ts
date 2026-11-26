import { describe, expect, it } from 'vitest'
import { eventToHeartbeatPayload } from './hook.js'
import { CLI_VERSION } from './version.js'
import type { NormalizedEvent } from '@esyion/vakatime-core'

const event: NormalizedEvent = {
  agent: 'zcode',
  event_type: 'turn_end',
  project: 'D:/workspace/vakatime',
  session_id: 'sess_1',
  turn_id: 'turn_1',
  ts: 1779000000,
  timezone: 'Asia/Shanghai',
}

describe('eventToHeartbeatPayload — runtime environment fields', () => {
  it('reports OS, machine name, arch, and CLI version on the hook path', () => {
    const payload = eventToHeartbeatPayload(event)

    expect(typeof payload.operating_system).toBe('string')
    expect((payload.operating_system as string).length).toBeGreaterThan(0)
    expect(typeof payload.machine_name).toBe('string')
    expect((payload.machine_name as string).length).toBeGreaterThan(0)
    expect(payload.meta).toMatchObject({
      event_type: 'turn_end',
      timezone: 'Asia/Shanghai',
      cpu_arch: process.arch,
      cli_version: CLI_VERSION,
    })
  })

  it('keeps vendor meta on top of the environment meta', () => {
    const payload = eventToHeartbeatPayload({
      ...event,
      meta: { model: 'glm-4.7' },
    })
    expect(payload.meta).toMatchObject({ model: 'glm-4.7', cli_version: CLI_VERSION })
  })
})
