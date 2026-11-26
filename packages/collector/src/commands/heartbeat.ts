import { hostname } from 'node:os'
import { uploadOrQueue } from './shared.js'
import { CLI_VERSION } from '../version.js'

export interface HeartbeatOptions {
  entity: string
  project: string | undefined
  branch: string | undefined
  language: string | undefined
  editor: string | undefined
  machine: string | undefined
  type: string | undefined
  category: string | undefined
  time: string | undefined
  write: boolean
}

export async function runHeartbeatCommand(opts: HeartbeatOptions): Promise<void> {
  await uploadOrQueue({
    entity: opts.entity,
    type: opts.type ?? 'file',
    category: opts.category ?? 'coding',
    time: opts.time ?? new Date().toISOString(),
    project: opts.project,
    branch: opts.branch,
    language: opts.language,
    editor: opts.editor,
    operating_system: process.platform,
    machine_name: opts.machine ?? hostname(),
    is_write: opts.write,
    meta: {
      cpu_arch: process.arch,
      cli_version: CLI_VERSION,
    },
  })
}
