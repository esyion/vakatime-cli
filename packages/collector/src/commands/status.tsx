import { existsSync, readFileSync } from 'node:fs'
import { configPath, hookLogPath, readConfig } from '../config.js'
import { isAgentConfigured, listSupportedAgents, type AgentType } from '../setup.js'
import { buildHeatmapGrid, heatLevel, summarizeHookLog, type HookLogSummary } from '../stats.js'
import { readQueue } from '../upload.js'
import type { StatusData } from '../ui/StatusPanel.js'

function loadSummary(): HookLogSummary {
  const logPath = hookLogPath()
  if (!existsSync(logPath)) {
    return { events: [], byAgent: {}, lastEventAt: null, malformedLines: 0 }
  }
  return summarizeHookLog(readFileSync(logPath, 'utf-8').split('\n'))
}

const LEVEL_GLYPH = [' ', '░', '▒', '▓', '█'] as const

function printPlainStatus(data: Omit<StatusData, 'summary'>, summary: HookLogSummary): void {
  const agentLine = data.agents.map((agent) => `${agent.configured ? '✓' : '·'} ${agent.name}`).join('  ')
  console.log(`config: ${data.configPath}`)
  console.log(`endpoint: ${data.endpoint ?? 'not configured'}`)
  console.log(`api key: ${data.apiKeyMasked ?? 'not configured'}`)
  console.log(`queued heartbeats: ${data.queued}`)
  console.log(`hooks: ${agentLine}`)

  const activityAgents = Object.entries(summary.byAgent).sort((a, b) => b[1] - a[1])
  console.log('')
  console.log(`activity: ${summary.events.length} events (${activityAgents.map(([a, c]) => `${a} ${c}`).join(' · ') || 'none'})`)
  // Daily bars for in-range days.
  const grid = buildHeatmapGrid(summary, data.weeks)
  for (const column of grid.columns) {
    for (const cell of column) {
      if (cell.future || cell.count === 0) continue
      const glyph = LEVEL_GLYPH[heatLevel(cell.count)] ?? '█'
      console.log(`${cell.date}  ${glyph.repeat(Math.min(cell.count, 40))} ${cell.count}`)
    }
  }
  const last = summary.lastEventAt === null ? 'never' : summary.lastEventAt.toLocaleString()
  console.log(`Last event: ${last}`)
  console.log('')
  console.log('(pipe output — run inside a terminal for the heatmap)')
}

export async function runStatusCommand(weeks: number): Promise<void> {
  const config = readConfig()
  const summary = loadSummary()
  const data: Omit<StatusData, 'summary'> = {
    configPath: existsSync(configPath()) ? configPath() : 'missing',
    endpoint: config?.endpoint ?? null,
    apiKeyMasked: config ? `${config.apiKey.slice(0, 8)}...` : null,
    queued: readQueue().length,
    hookLogPath: hookLogPath(),
    agents: listSupportedAgents().map((name) => ({ name, configured: isAgentConfigured(name as AgentType) })),
    weeks,
  }

  // Plain output when not attached to a terminal (scripts/CI/pipes).
  if (!process.stdout.isTTY) {
    printPlainStatus(data, summary)
    return
  }

  const { renderOnce } = await import('../ui/render-once.js')
  const { StatusPanel } = await import('../ui/StatusPanel.js')
  await renderOnce(<StatusPanel data={{ ...data, summary }} />)
}
