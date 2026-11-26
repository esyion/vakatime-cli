import { describe, expect, it } from 'vitest'
import { buildHeatmapGrid, heatLevel, summarizeHookLog, type HookLogSummary } from './stats.js'

function iso(isoString: string): string {
  return new Date(isoString).toISOString()
}

function uploadLine(ts: string, agent: string, status: 'ok' | 'queued' = 'ok'): string {
  return JSON.stringify({ ts: iso(ts), phase: 'upload', status, agent, entity: 'x' })
}

describe('summarizeHookLog', () => {
  it('counts upload ok/queued events and groups by agent', () => {
    const lines = [
      uploadLine('2026-11-26T01:00:00Z', 'codex'),
      uploadLine('2026-11-26T02:00:00Z', 'codex'),
      uploadLine('2026-11-26T03:00:00Z', 'zcode', 'queued'),
      JSON.stringify({ ts: iso('2026-11-26T04:00:00Z'), phase: 'upload', status: 'failed', agent: 'codex' }),
      JSON.stringify({ ts: iso('2026-11-26T05:00:00Z'), phase: 'adapt', status: 'ignored', source: 'codex' }),
      JSON.stringify({ ts: iso('2026-11-26T06:00:00Z'), phase: 'hook-start', source: 'codex' }),
    ]
    const summary = summarizeHookLog(lines)
    expect(summary.events).toHaveLength(3)
    expect(summary.byAgent).toEqual({ codex: 2, zcode: 1 })
    expect(summary.lastEventAt?.toISOString()).toBe(iso('2026-11-26T03:00:00Z'))
    expect(summary.events[2]?.queued).toBe(true)
    expect(summary.malformedLines).toBe(0)
  })

  it('counts malformed lines but never throws', () => {
    const summary = summarizeHookLog(['{broken', '', 'null', '[]', '"str"', '{"ts":"nope","phase":"upload","status":"ok","agent":"x"}'])
    // The object with an unparseable ts is malformed too; null/array/string fail the object guard.
    expect(summary.events).toHaveLength(0)
    expect(summary.malformedLines).toBeGreaterThanOrEqual(5)
  })

  it('returns an empty summary for an empty log', () => {
    const summary = summarizeHookLog([])
    expect(summary.events).toHaveLength(0)
    expect(summary.byAgent).toEqual({})
    expect(summary.lastEventAt).toBeNull()
  })
})

describe('buildHeatmapGrid', () => {
  // Wednesday 2026-11-25.
  const now = new Date(2026, 10, 25, 12, 0, 0)

  function emptySummary(): HookLogSummary {
    return { events: [], byAgent: {}, lastEventAt: null, malformedLines: 0 }
  }

  it('produces N Sunday-aligned columns with today in the last column', () => {
    const grid = buildHeatmapGrid(emptySummary(), 17, now)
    expect(grid.columns).toHaveLength(17)
    for (const column of grid.columns) {
      expect(column).toHaveLength(7)
    }
    const lastColumn = grid.columns[16]!
    // Column 16 rows 0..2 are before Wednesday; row 3 is today; rows 4..6 are future.
    expect(lastColumn[3]?.date).toBe('2026-11-25')
    expect(lastColumn[3]?.future).toBe(false)
    expect(lastColumn[6]?.future).toBe(true)
    // Column 0 starts on a Sunday.
    const firstDate = new Date(grid.columns[0]![0]!.date)
    expect(firstDate.getDay()).toBe(0)
  })

  it('buckets events into local days and totals them', () => {
    // Construct timestamps from local Dates so the test is timezone-independent.
    const local = (y: number, m: number, d: number, h: number): string =>
      new Date(y, m - 1, d, h).toISOString()
    const summary = summarizeHookLog([
      uploadLine(local(2026, 11, 25, 9), 'codex'),
      uploadLine(local(2026, 11, 25, 21), 'codex'),
      uploadLine(local(2026, 11, 24, 10), 'claude-code'),
    ])
    const grid = buildHeatmapGrid(summary, 4, now)
    expect(grid.totalInRange).toBe(3)
    const today = grid.columns[3]!.find((c) => c.date === '2026-11-25')!
    expect(today.count).toBe(2)
    const yesterday = grid.columns[3]!.find((c) => c.date === '2026-11-24')!
    expect(yesterday.count).toBe(1)
  })

  it('never counts future days even if data exists', () => {
    const tomorrow = new Date(2026, 10, 26, 8).toISOString()
    const summary = summarizeHookLog([uploadLine(tomorrow, 'codex')])
    const grid = buildHeatmapGrid(summary, 4, now)
    expect(grid.totalInRange).toBe(0)
  })

  it('clamps weeks to at least 1', () => {
    const grid = buildHeatmapGrid(emptySummary(), 0, now)
    expect(grid.weeks).toBe(1)
    expect(grid.columns).toHaveLength(1)
  })
})

describe('heatLevel', () => {
  it('maps counts to 5 levels', () => {
    expect(heatLevel(0)).toBe(0)
    expect(heatLevel(1)).toBe(1)
    expect(heatLevel(2)).toBe(1)
    expect(heatLevel(3)).toBe(2)
    expect(heatLevel(5)).toBe(2)
    expect(heatLevel(6)).toBe(3)
    expect(heatLevel(9)).toBe(3)
    expect(heatLevel(10)).toBe(4)
    expect(heatLevel(50)).toBe(4)
  })
})
