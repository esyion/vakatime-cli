#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { configPath, hookLogPath, queuePath, readConfig, writeConfig } from './config.js'
import { adaptHookPayload, readStdinJson } from './hook.js'
import { enqueueHeartbeat, flushQueue, postHeartbeat, readQueue, type HeartbeatPayload } from './upload.js'
import { setupAgent, removeAgent, listSupportedAgents, type AgentType } from './setup.js'
import { dirname } from 'node:path'

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name)
  return index >= 0 ? (args[index + 1] ?? null) : null
}

function has(args: string[], name: string): boolean {
  return args.includes(name)
}

function printHelp(): void {
  console.log(`vakatime collector

Usage:
  vakatime login --endpoint <url> --api-key <key>
  vakatime setup <agent>       # auto-configure hooks (claude-code, codex, cursor, opencode, gemini-cli, zcode)
  vakatime remove <agent>      # remove the hooks vakatime registered
  vakatime status
  vakatime heartbeat --entity <path> [--project name] [--language ts] [--editor name]
  vakatime flush
  vakatime hook --source codex|claude-code|cursor|opencode|gemini-cli|zcode
  vakatime --source <agent>   # hook mode shorthand
`)
}

function appendHookLog(entry: Record<string, unknown>): void {
  try {
    const path = hookLogPath()
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, { encoding: 'utf8' })
  } catch {
    // Hook logging must never break the agent client.
  }
}

function payloadSummary(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    hook_event_name: payload.hook_event_name,
    event: payload.event,
    session_id: payload.session_id,
    turn_id: payload.turn_id,
    cwd: payload.cwd,
    keys: Object.keys(payload).sort(),
  }
}
function requireConfig() {
  const config = readConfig()
  if (!config) throw new Error(`Not logged in. Run: vakatime login --endpoint <url> --api-key <key>`)
  return config
}

async function uploadOrQueue(payload: HeartbeatPayload): Promise<void> {
  const config = requireConfig()
  try {
    await postHeartbeat(config, payload)
    appendHookLog({ phase: 'upload', status: 'ok', entity: payload.entity, agent: payload.agent })
    console.log('heartbeat uploaded')
  } catch (err) {
    enqueueHeartbeat(payload)
    appendHookLog({
      phase: 'upload',
      status: 'queued',
      entity: payload.entity,
      agent: payload.agent,
      error: err instanceof Error ? err.message : String(err),
    })
    console.error(err instanceof Error ? err.message : String(err))
    console.error(`queued heartbeat at ${queuePath()}`)
  }
}
async function runHook(args: string[]): Promise<void> {
  const rawSource = option(args, '--source')
  const source = rawSource === 'claude' ? 'claude-code' : rawSource
  if (source !== 'codex' && source !== 'claude-code' && source !== 'cursor' && source !== 'opencode' && source !== 'gemini-cli' && source !== 'zcode') {
    throw new Error('--source must be codex, claude-code, cursor, opencode, gemini-cli, or zcode')
  }

  appendHookLog({ phase: 'hook-start', source, argv: args })
  const payload = await readStdinJson()
  if (!payload) {
    appendHookLog({ phase: 'stdin', source, status: 'empty' })
    return
  }

  appendHookLog({ phase: 'stdin', source, status: 'parsed', payload: payloadSummary(payload) })
  const heartbeat = adaptHookPayload(source, payload)
  if (!heartbeat) {
    appendHookLog({ phase: 'adapt', source, status: 'ignored', payload: payloadSummary(payload) })
    return
  }

  appendHookLog({ phase: 'adapt', source, status: 'ok', heartbeat })
  await uploadOrQueue(heartbeat)
}
async function run(args = process.argv.slice(2)): Promise<void> {
  const command = args[0]

  if (has(args, '--source') && command !== 'login' && command !== 'heartbeat') {
    await runHook(args)
    return
  }

  switch (command) {
    case 'login': {
      const endpoint = option(args, '--endpoint')
      const apiKey = option(args, '--api-key')
      if (!endpoint || !apiKey) throw new Error('login requires --endpoint and --api-key')
      writeConfig({ endpoint, apiKey })
      console.log(`saved collector config to ${configPath()}`)
      break
    }
    case 'setup': {
      const agent = args[1]
      const supported = listSupportedAgents()
      if (!agent || !supported.includes(agent)) {
        console.error(`setup requires a valid agent: ${supported.join(', ')}`)
        process.exit(1)
      }
      setupAgent(agent as AgentType)
      break
    }
    case 'remove': {
      const agent = args[1]
      const supported = listSupportedAgents()
      if (!agent || !supported.includes(agent)) {
        console.error(`remove requires a valid agent: ${supported.join(', ')}`)
        process.exit(1)
      }
      removeAgent(agent as AgentType)
      break
    }
    case 'status': {
      const config = readConfig()
      const queued = readQueue().length
      console.log(`config: ${existsSync(configPath()) ? configPath() : 'missing'}`)
      console.log(`endpoint: ${config?.endpoint ?? 'not configured'}`)
      console.log(`api key: ${config ? `${config.apiKey.slice(0, 8)}...` : 'not configured'}`)
      console.log(`queued heartbeats: ${queued}`)
      break
    }
    case 'heartbeat': {
      const entity = option(args, '--entity')
      if (!entity) throw new Error('heartbeat requires --entity')
      await uploadOrQueue({
        entity,
        type: option(args, '--type') ?? 'file',
        category: option(args, '--category') ?? 'coding',
        time: option(args, '--time') ?? new Date().toISOString(),
        project: option(args, '--project'),
        branch: option(args, '--branch'),
        language: option(args, '--language'),
        editor: option(args, '--editor'),
        operating_system: process.platform,
        machine_name: option(args, '--machine') ?? undefined,
        is_write: has(args, '--write'),
      })
      break
    }
    case 'flush': {
      const flushed = await flushQueue(requireConfig())
      console.log(`flushed ${flushed} queued heartbeats`)
      break
    }
    case 'hook': {
      await runHook(args)
      break
    }
    case 'help':
    case undefined:
      printHelp()
      break
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})


