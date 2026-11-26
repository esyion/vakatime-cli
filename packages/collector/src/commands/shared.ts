import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { hookLogPath, queuePath, readConfig, type CollectorConfig } from '../config.js'
import { enqueueHeartbeat, postHeartbeat } from '../upload.js'
import type { HeartbeatPayload } from '../upload.js'

export function appendHookLog(entry: Record<string, unknown>): void {
  try {
    const path = hookLogPath()
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, { encoding: 'utf8' })
  } catch {
    // Hook logging must never break the agent client.
  }
}

export function payloadSummary(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    hook_event_name: payload.hook_event_name,
    event: payload.event,
    session_id: payload.session_id,
    turn_id: payload.turn_id,
    cwd: payload.cwd,
    keys: Object.keys(payload).sort(),
  }
}

function requireConfig(): CollectorConfig {
  const config = readConfig()
  if (!config) throw new Error(`Not logged in. Run: vakatime login --endpoint <url> --api-key <key>`)
  return config
}

export async function uploadOrQueue(payload: HeartbeatPayload): Promise<void> {
  const config = requireConfig()
  try {
    await postHeartbeat(config, payload)
    appendHookLog({ phase: 'upload', status: 'ok', entity: payload.entity, agent: payload.agent })
    console.log('heartbeat uploaded')
  } catch (err) {
    enqueueHeartbeat(payload)
    appendHookLog({
      phase: 'upload',
      status: 'queued',
      entity: payload.entity,
      agent: payload.agent,
      error: err instanceof Error ? err.message : String(err),
    })
    console.error(err instanceof Error ? err.message : String(err))
    console.error(`queued heartbeat at ${queuePath()}`)
  }
}
