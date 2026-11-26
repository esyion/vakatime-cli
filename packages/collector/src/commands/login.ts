import { configPath, writeConfig } from '../config.js'

export function runLoginCommand(endpoint: string, apiKey: string): void {
  writeConfig({ endpoint, apiKey })
  console.log(`saved collector config to ${configPath()}`)
}
