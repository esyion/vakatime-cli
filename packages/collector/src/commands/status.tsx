import { existsSync } from 'node:fs'
import { configPath, hookLogPath, readConfig } from '../config.js'
import { isAgentConfigured, listSupportedAgents, type AgentType } from '../setup.js'
import { readQueue } from '../upload.js'
import type { StatusData } from '../ui/StatusPanel.js'

export async function runStatusCommand(): Promise<void> {
  const config = readConfig()
  const data: StatusData = {
    configPath: existsSync(configPath()) ? configPath() : 'missing',
    endpoint: config?.endpoint ?? null,
    apiKeyMasked: config ? `${config.apiKey.slice(0, 8)}...` : null,
    queued: readQueue().length,
    hookLogPath: hookLogPath(),
    agents: listSupportedAgents().map((name) => ({ name, configured: isAgentConfigured(name as AgentType) })),
  }

  // Plain output when not attached to a terminal (scripts/CI/pipes).
  if (!process.stdout.isTTY) {
    const agentLine = data.agents
      .map((agent) => `${agent.configured ? '✓' : '·'} ${agent.name}`)
      .join('  ')
    console.log(`config: ${data.configPath}`)
    console.log(`endpoint: ${data.endpoint ?? 'not configured'}`)
    console.log(`api key: ${data.apiKeyMasked ?? 'not configured'}`)
    console.log(`queued heartbeats: ${data.queued}`)
    console.log(`agents: ${agentLine}`)
    return
  }

  const { renderOnce } = await import('../ui/render-once.js')
  const { StatusPanel } = await import('../ui/StatusPanel.js')
  await renderOnce(<StatusPanel data={data} />)
}
