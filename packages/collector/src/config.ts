import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface CollectorConfig {
  endpoint: string
  apiKey: string
}

export function configPath(): string {
  return join(homedir(), '.vakatime', 'config.json')
}

export function queuePath(): string {
  return join(homedir(), '.vakatime', 'queue.jsonl')
}

export function hookLogPath(): string {
  return join(homedir(), '.vakatime', 'hook.log')
}

export function ensureConfigDir(): void {
  mkdirSync(dirname(configPath()), { recursive: true, mode: 0o700 })
}

export function readConfig(): CollectorConfig | null {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<CollectorConfig>
    if (!parsed.endpoint || !parsed.apiKey) return null
    return { endpoint: parsed.endpoint.replace(/\/$/, ''), apiKey: parsed.apiKey }
  } catch {
    return null
  }
}

export function writeConfig(config: CollectorConfig): void {
  ensureConfigDir()
  writeFileSync(configPath(), `${JSON.stringify({ endpoint: config.endpoint.replace(/\/$/, ''), apiKey: config.apiKey }, null, 2)}\n`, {
    mode: 0o600,
  })
}
