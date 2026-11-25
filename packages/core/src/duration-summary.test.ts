import { describe, expect, it } from 'vitest'
import { buildDurationsFromHeartbeats } from './duration.js'
import { normalizeHeartbeat } from './heartbeat.js'
import { buildDailySummariesFromDurations } from './summary.js'

function hb(input: Parameters<typeof normalizeHeartbeat>[0]) {
  const result = normalizeHeartbeat(input)
  if (!result.ok || !result.heartbeat) throw new Error('invalid heartbeat fixture')
  return result.heartbeat
}

describe('duration and summary aggregation', () => {
  it('joins nearby heartbeats for the same activity and splits distant ones', () => {
    const durations = buildDurationsFromHeartbeats(
      [
        hb({ entity: 'src/a.ts', time: 100, project: 'vakatime', language: 'TypeScript' }),
        hb({ entity: 'src/a.ts', time: 160, project: 'vakatime', language: 'TypeScript' }),
        hb({ entity: 'src/a.ts', time: 2_000, project: 'vakatime', language: 'TypeScript' }),
      ],
      { timeoutSec: 900 },
    )

    expect(durations).toHaveLength(2)
    expect(durations[0]).toMatchObject({ durationSec: 60, heartbeatCount: 2 })
    expect(durations[1]).toMatchObject({ durationSec: 0, heartbeatCount: 1 })
  })

  it('builds daily summary breakdowns from durations', () => {
    const durations = buildDurationsFromHeartbeats([
      hb({ entity: 'src/a.ts', time: '2026-07-06T01:00:00.000Z', project: 'api', language: 'TypeScript', editor: 'VS Code' }),
      hb({ entity: 'src/a.ts', time: '2026-07-06T01:10:00.000Z', project: 'api', language: 'TypeScript', editor: 'VS Code' }),
      hb({ entity: 'README.md', time: '2026-07-06T02:00:00.000Z', project: 'docs', language: 'Markdown', editor: 'VS Code' }),
      hb({ entity: 'README.md', time: '2026-07-06T02:05:00.000Z', project: 'docs', language: 'Markdown', editor: 'VS Code' }),
    ])

    const summaries = buildDailySummariesFromDurations(durations, { timeZone: 'UTC' })
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.date).toBe('2026-07-06')
    expect(summaries[0]?.totalSeconds).toBe(900)
    expect(summaries[0]?.byProject).toEqual([
      { key: 'api', seconds: 600 },
      { key: 'docs', seconds: 300 },
    ])
  })
})
