// Pure analytics over the local hook log — no Ink, no React, no node:fs.
// Consumed by the `stats` command (Ink TUI or plain fallback) and unit tests.

export interface HookEvent {
  ts: Date
  agent: string
  queued: boolean
}

export interface HookLogSummary {
  events: HookEvent[]
  byAgent: Record<string, number>
  lastEventAt: Date | null
  malformedLines: number
}

export const HEAT_LEVELS = 5

/**
 * Parse raw hook.log lines into activity events.
 *
 * Activity = one upload attempt per heartbeat (`phase: "upload"`), whether it
 * succeeded (`status: "ok"`) or was queued offline (`status: "queued"`).
 * Adapt-ignored / malformed-stdin lines are noise, not activity.
 */
export function summarizeHookLog(lines: string[]): HookLogSummary {
  const events: HookEvent[] = []
  const byAgent: Record<string, number> = {}
  let lastEventAt: Date | null = null
  let malformedLines = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    let entry: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      entry = parsed as Record<string, unknown>
    } catch {
      malformedLines += 1
      continue
    }
    if (entry.phase !== 'upload') continue
    if (entry.status !== 'ok' && entry.status !== 'queued') continue
    if (typeof entry.agent !== 'string' || entry.agent.length === 0) continue

    const ts = new Date(String(entry.ts ?? ''))
    if (Number.isNaN(ts.getTime())) {
      malformedLines += 1
      continue
    }

    events.push({ ts, agent: entry.agent, queued: entry.status === 'queued' })
    byAgent[entry.agent] = (byAgent[entry.agent] ?? 0) + 1
    if (lastEventAt === null || ts.getTime() > lastEventAt.getTime()) lastEventAt = ts
  }

  return { events, byAgent, lastEventAt, malformedLines }
}

// Local calendar date as YYYY-MM-DD (no locale dependency).
function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface HeatmapCell {
  date: string
  count: number
  future: boolean
}

export interface HeatmapGrid {
  /** columns of 7 cells each; column 0 starts on a Sunday; today is in the last column */
  columns: HeatmapCell[][]
  weeks: number
  totalInRange: number
}

/**
 * Build a GitHub-style grid: `weeks` columns, Sun..Sat rows, ending today.
 * Days before the range become cells with count 0 (rendered dim), days
 * after today are `future: true` (blank).
 */
export function buildHeatmapGrid(summary: HookLogSummary, weeks: number, now: Date = new Date()): HeatmapGrid {
  const safeWeeks = Math.max(1, Math.floor(weeks))
  const countByDay = new Map<string, number>()
  for (const event of summary.events) {
    const key = dayKey(event.ts)
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1)
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayDow = today.getDay()
  // First cell = Sunday, `weeks - 1` full weeks before the current week.
  const start = new Date(today)
  start.setDate(start.getDate() - todayDow - (safeWeeks - 1) * 7)

  const columns: HeatmapCell[][] = []
  let totalInRange = 0
  for (let w = 0; w < safeWeeks; w += 1) {
    const column: HeatmapCell[] = []
    for (let d = 0; d < 7; d += 1) {
      const cellDate = new Date(start)
      cellDate.setDate(start.getDate() + w * 7 + d)
      const key = dayKey(cellDate)
      const future = cellDate.getTime() > today.getTime()
      const count = future ? 0 : (countByDay.get(key) ?? 0)
      if (!future) totalInRange += count
      column.push({ date: key, count, future })
    }
    columns.push(column)
  }

  return { columns, weeks: safeWeeks, totalInRange }
}

/** Map a day's activity count to a 0..4 color level (0 = quiet). */
export function heatLevel(count: number): number {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}
