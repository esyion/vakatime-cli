import { existsSync } from 'node:fs'
import { configPath, hookLogPath, readConfig } from '../config.js'
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
  }

  // Plain output when not attached to a terminal (scripts/CI/pipes).
  if (!process.stdout.isTTY) {
    console.log(`config: ${data.configPath}`)
    console.log(`endpoint: ${data.endpoint ?? 'not configured'}`)
    console.log(`api key: ${data.apiKeyMasked ?? 'not configured'}`)
    console.log(`queued heartbeats: ${data.queued}`)
    return
  }

  const { renderOnce } = await import('../ui/render-once.js')
  const { StatusPanel } = await import('../ui/StatusPanel.js')
  await renderOnce(<StatusPanel data={data} />)
}
