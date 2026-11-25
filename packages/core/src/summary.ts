import type { DurationSegment } from './duration.js'

export interface DailySummaryBreakdownRow {
  key: string
  seconds: number
}

export interface DailySummary {
  date: string
  totalSeconds: number
  byProject: DailySummaryBreakdownRow[]
  byLanguage: DailySummaryBreakdownRow[]
  byEditor: DailySummaryBreakdownRow[]
  byCategory: DailySummaryBreakdownRow[]
}

function localDateKey(unixSeconds: number, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(unixSeconds * 1000))
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

function add(map: Map<string, number>, key: string | null, seconds: number): void {
  const safeKey = key && key.trim().length > 0 ? key : 'Unknown'
  map.set(safeKey, (map.get(safeKey) ?? 0) + seconds)
}

function rows(map: Map<string, number>): DailySummaryBreakdownRow[] {
  return [...map.entries()]
    .map(([key, seconds]) => ({ key, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.key.localeCompare(b.key))
}

export function buildDailySummariesFromDurations(
  durations: DurationSegment[],
  options: { timeZone?: string } = {},
): DailySummary[] {
  const timeZone = options.timeZone ?? 'UTC'
  const groups = new Map<
    string,
    {
      totalSeconds: number
      byProject: Map<string, number>
      byLanguage: Map<string, number>
      byEditor: Map<string, number>
      byCategory: Map<string, number>
    }
  >()

  for (const duration of durations) {
    const date = localDateKey(duration.startedAt, timeZone)
    const group = groups.get(date) ?? {
      totalSeconds: 0,
      byProject: new Map<string, number>(),
      byLanguage: new Map<string, number>(),
      byEditor: new Map<string, number>(),
      byCategory: new Map<string, number>(),
    }
    group.totalSeconds += duration.durationSec
    add(group.byProject, duration.project, duration.durationSec)
    add(group.byLanguage, duration.language, duration.durationSec)
    add(group.byEditor, duration.editor, duration.durationSec)
    add(group.byCategory, duration.category, duration.durationSec)
    groups.set(date, group)
  }

  return [...groups.entries()]
    .map(([date, group]) => ({
      date,
      totalSeconds: group.totalSeconds,
      byProject: rows(group.byProject),
      byLanguage: rows(group.byLanguage),
      byEditor: rows(group.byEditor),
      byCategory: rows(group.byCategory),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
