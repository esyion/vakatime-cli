import { flushQueue, readQueue } from '../upload.js'
import { readConfig } from '../config.js'

export async function runFlushCommand(): Promise<void> {
  const config = readConfig()
  if (!config) throw new Error(`Not logged in. Run: vakatime login --endpoint <url> --api-key <key>`)
  const flushed = await flushQueue(config)
  console.log(`flushed ${flushed} queued heartbeats (of ${readQueue().length} still queued after flush)`)
}
