import type { HeartbeatCategory, HeartbeatEntityType, NormalizedHeartbeat } from './heartbeat.js'

export const DEFAULT_HEARTBEAT_TIMEOUT_SEC = 15 * 60

export interface DurationSegment {
  entity: string
  type: HeartbeatEntityType
  category: HeartbeatCategory
  project: string | null
  branch: string | null
  language: string | null
  editor: string | null
  operatingSystem: string | null
  machineName: string | null
  startedAt: number
  endedAt: number
  durationSec: number
  heartbeatCount: number
}

export interface BuildDurationsOptions {
  timeoutSec?: number
}

function durationGroupKey(heartbeat: NormalizedHeartbeat): string {
  return [
    heartbeat.entity,
    heartbeat.type,
    heartbeat.category,
    heartbeat.project ?? '',
    heartbeat.branch ?? '',
    heartbeat.language ?? '',
    heartbeat.editor ?? '',
    heartbeat.operatingSystem ?? '',
    heartbeat.machineName ?? '',
  ].join('\u001f')
}

function createSegment(heartbeat: NormalizedHeartbeat): DurationSegment {
  return {
    entity: heartbeat.entity,
    type: heartbeat.type,
    category: heartbeat.category,
    project: heartbeat.project,
    branch: heartbeat.branch,
    language: heartbeat.language,
    editor: heartbeat.editor,
    operatingSystem: heartbeat.operatingSystem,
    machineName: heartbeat.machineName,
    startedAt: heartbeat.time,
    endedAt: heartbeat.time,
    durationSec: 0,
    heartbeatCount: 1,
  }
}

export function buildDurationsFromHeartbeats(
  heartbeats: NormalizedHeartbeat[],
  options: BuildDurationsOptions = {},
): DurationSegment[] {
  const timeoutSec = options.timeoutSec ?? DEFAULT_HEARTBEAT_TIMEOUT_SEC
  const sorted = [...heartbeats].sort((a, b) => a.time - b.time)
  const durations: DurationSegment[] = []
  let current: DurationSegment | null = null
  let currentKey: string | null = null

  for (const heartbeat of sorted) {
    const nextKey = durationGroupKey(heartbeat)
    const gap = current ? heartbeat.time - current.endedAt : Number.POSITIVE_INFINITY

    if (!current || currentKey !== nextKey || gap < 0 || gap > timeoutSec) {
      if (current) durations.push(current)
      current = createSegment(heartbeat)
      currentKey = nextKey
      continue
    }

    current.endedAt = heartbeat.time
    current.durationSec = Math.max(0, current.endedAt - current.startedAt)
    current.heartbeatCount += 1
  }

  if (current) durations.push(current)
  return durations
}
