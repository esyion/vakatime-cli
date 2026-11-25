import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { queuePath, type CollectorConfig } from './config.js'

export type HeartbeatPayload = Record<string, unknown>

function heartbeatUrl(endpoint: string): string {
  return `${endpoint.replace(/\/$/, '')}/api/v1/users/current/heartbeats`
}

function bulkHeartbeatUrl(endpoint: string): string {
  return `${endpoint.replace(/\/$/, '')}/api/v1/users/current/heartbeats/bulk`
}

export async function postHeartbeat(config: CollectorConfig, payload: HeartbeatPayload): Promise<void> {
  const response = await fetch(heartbeatUrl(config.endpoint), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`heartbeat upload failed: ${response.status} ${text}`)
  }
}

export async function postHeartbeatsBulk(config: CollectorConfig, payloads: HeartbeatPayload[]): Promise<void> {
  if (payloads.length === 0) return
  const response = await fetch(bulkHeartbeatUrl(config.endpoint), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payloads),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`bulk heartbeat upload failed: ${response.status} ${text}`)
  }
}

export function enqueueHeartbeat(payload: HeartbeatPayload): void {
  const path = queuePath()
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  appendFileSync(path, `${JSON.stringify(payload)}\n`, { encoding: 'utf8' })
}

export function readQueue(): HeartbeatPayload[] {
  const path = queuePath()
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HeartbeatPayload)
}

export async function flushQueue(config: CollectorConfig): Promise<number> {
  const path = queuePath()
  const payloads = readQueue()
  if (payloads.length === 0) return 0
  await postHeartbeatsBulk(config, payloads.slice(0, 25))

  const remaining = payloads.slice(25)
  if (remaining.length === 0) {
    writeFileSync(path, '')
  } else {
    const tmp = `${path}.tmp`
    writeFileSync(tmp, remaining.map((payload) => JSON.stringify(payload)).join('\n') + '\n')
    renameSync(tmp, path)
  }
  return payloads.length - remaining.length
}
