import { describe, expect, it } from 'vitest'
import { heartbeatDedupeKey, normalizeHeartbeat, normalizeHeartbeatsBulk } from './heartbeat.js'

describe('normalizeHeartbeat', () => {
  it('normalizes a minimal coding heartbeat', () => {
    const result = normalizeHeartbeat({
      entity: 'src/index.ts',
      time: '2026-07-06T03:00:00.000Z',
      project: 'vakatime',
      language: 'TypeScript',
      editor: 'VS Code',
      isWrite: true,
    })

    expect(result.ok).toBe(true)
    expect(result.heartbeat).toMatchObject({
      entity: 'src/index.ts',
      type: 'file',
      category: 'coding',
      project: 'vakatime',
      language: 'TypeScript',
      editor: 'VS Code',
      isWrite: true,
      totalTokens: 0,
    })
  })

  it('normalizes an agent heartbeat and derives token totals', () => {
    const result = normalizeHeartbeat({
      entity: 'codex-turn',
      type: 'agent',
      time: 1_783_307_600,
      agent: 'codex',
      sessionId: 's1',
      turnId: 't1',
      inputTokens: 10,
      outputTokens: 20,
      reasoningOutputTokens: 5,
    })

    expect(result.ok).toBe(true)
    expect(result.heartbeat).toMatchObject({
      type: 'agent',
      category: 'ai',
      agent: 'codex',
      totalTokens: 35,
    })
  })

  it('reports invalid rows in bulk normalization', () => {
    const result = normalizeHeartbeatsBulk([
      { entity: 'ok.ts', time: 1 },
      { entity: '', time: 'not-a-date' },
    ])

    expect(result.heartbeats).toHaveLength(1)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.issues.map((issue) => issue.path)).toEqual(['entity', 'time'])
  })

  it('creates stable dedupe keys', () => {
    const result = normalizeHeartbeat({ entity: 'src/index.ts', time: 1, project: 'vakatime' })
    expect(result.ok && result.heartbeat ? heartbeatDedupeKey(result.heartbeat) : null).toBe(
      '1.000\u001fsrc/index.ts\u001fvakatime\u001f\u001fcoding\u001ffile',
    )
  })
})
