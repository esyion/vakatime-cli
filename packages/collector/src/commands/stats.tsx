import { existsSync, readFileSync } from 'node:fs'
import { hookLogPath } from '../config.js'
import { buildHeatmapGrid, heatLevel, summarizeHookLog, type HookLogSummary } from '../stats.js'

function loadSummary(): HookLogSummary {
  const logPath = hookLogPath()
  if (!existsSync(logPath)) {
    return { events: [], byAgent: {}, lastEventAt: null, malformedLines: 0 }
  }
  return summarizeHookLog(readFileSync(logPath, 'utf-8').split('\n'))
}

const LEVEL_GLYPH = [' ', '░', '▒', '▓', '█'] as const

function printPlainStats(summary: HookLogSummary, weeks: number): void {
  const grid = buildHeatmapGrid(summary, weeks)
  console.log(`vakatime activity — ${grid.totalInRange} events in the last ${grid.weeks} weeks`)
  console.log('')

  for (const column of grid.columns) {
    for (const cell of column) {
      if (cell.future || cell.count === 0) continue
      const glyph = LEVEL_GLYPH[heatLevel(cell.count)] ?? '█'
      console.log(`${cell.date}  ${glyph.repeat(Math.min(cell.count, 40))} ${cell.count}`)
    }
  }

  console.log('')
  const agents = Object.entries(summary.byAgent).sort((a, b) => b[1] - a[1])
  for (const [agent, count] of agents) {
    console.log(`${agent.padEnd(12)} ${count} events`)
  }
  if (agents.length === 0) console.log('No recorded activity yet — hooks have not fired.')
  const last = summary.lastEventAt === null ? 'never' : summary.lastEventAt.toLocaleString()
  console.log(`Last event: ${last}`)
  console.log('')
  console.log('(pipe output — run inside a terminal for the interactive heatmap)')
}

export async function runStatsCommand(weeks: number): Promise<void> {
  const summary = loadSummary()

  if (!process.stdout.isTTY) {
    printPlainStats(summary, weeks)
    return
  }

  const { render } = await import('ink')
  const { StatsApp } = await import('../ui/StatsApp.js')
  const instance = render(<StatsApp initial={summary} reload={loadSummary} weeks={weeks} />)
  await instance.waitUntilExit()
}
