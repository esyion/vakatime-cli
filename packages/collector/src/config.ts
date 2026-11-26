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

// fetch() requires an absolute URL with a scheme — a bare host like
// "vakatime.example.com" would die with "Failed to parse URL". Normalize at
// the config boundary so every reader/writer gets a scheme and no trailing
// slash.
export function normalizeEndpoint(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`invalid endpoint "${input}" — expected a host like https://vakatime.example.com`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`unsupported endpoint protocol "${url.protocol}" — use https://...`)
  }
  // Strip trailing slashes only after scheme detection — doing it first would
  // mangle a scheme-only string like "http://" into "http:".
  return withScheme.replace(/\/+$/, '')
}

export function readConfig(): CollectorConfig | null {
  let parsed: Partial<CollectorConfig>
  try {
    parsed = JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<CollectorConfig>
  } catch {
    return null
  }
  if (!parsed.endpoint || !parsed.apiKey) return null
  // Deliberately outside the try: a malformed endpoint must surface its own
  // error, not be swallowed into "not logged in".
  return { endpoint: normalizeEndpoint(parsed.endpoint), apiKey: parsed.apiKey }
}

export function writeConfig(config: CollectorConfig): void {
  ensureConfigDir()
  writeFileSync(configPath(), `${JSON.stringify({ endpoint: normalizeEndpoint(config.endpoint), apiKey: config.apiKey }, null, 2)}\n`, {
    mode: 0o600,
  })
}
