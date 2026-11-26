#!/usr/bin/env node
// Commander-based entrypoint. This module only imports light dependencies
// (commander, config, setup, upload, and the hook command); ink/react are
// loaded dynamically inside the interactive commands so the agent-spawned
// `hook` path keeps its fast cold start.
import { Argument, Command } from 'commander'
import { configPath, writeConfig } from './config.js'
import { listSupportedAgents, removeAgent, setupAgent, type AgentType } from './setup.js'
import { runHookCommand } from './commands/hook.js'

const VERSION = '0.3.0'

const program = new Command()
program
  .name('vakatime')
  .description('Vakatime collector — records AI coding agent activity and uploads heartbeats')
  .version(VERSION)

const agentChoices = listSupportedAgents()
const agentNames = agentChoices.join(', ')

// Legacy hook-mode shorthand: `vakatime --source <agent>` with no subcommand.
// Agents invoke this directly, so it is checked before commander parsing.
const argv = process.argv.slice(2)
const first = argv[0] ?? ''
const subcommands = new Set(['login', 'setup', 'remove', 'status', 'stats', 'flush', 'heartbeat', 'hook', 'help'])
if (argv.includes('--source') && !subcommands.has(first) && !argv.some((a) => a === '--help' || a === '-h' || a === '-V')) {
  void runHookCommand(argv).then(() => process.exit(process.exitCode ?? 0))
} else {
  void main()
}

async function main(): Promise<void> {
  program
    .command('login')
    .description('save the server endpoint and API key (~/.vakatime/config.json)')
    .requiredOption('--endpoint <url>', 'Vakatime server base URL')
    .requiredOption('--api-key <key>', 'API key created in the Vakatime dashboard')
    .action((options: { endpoint: string; apiKey: string }) => {
      writeConfig({ endpoint: options.endpoint, apiKey: options.apiKey })
      console.log(`saved collector config to ${configPath()}`)
    })

  program
    .command('setup')
    .description(`install hooks into an agent's native config (${agentNames}); omit <agent> for an interactive picker`)
    .addArgument(new Argument('[agent]', 'agent to configure').choices(agentChoices))
    .action(async (agent: string | undefined) => {
      const { runSetupCommand } = await import('./commands/setup.js')
      await runSetupCommand(agent)
    })

  program
    .command('remove')
    .description('remove only the hooks vakatime registered for an agent')
    .addArgument(new Argument('<agent>', 'agent to unregister').choices(agentChoices))
    .action((agent: string) => {
      removeAgent(agent as AgentType)
    })

  program
    .command('status')
    .description('one-shot overview: config, per-agent hook state, and an activity heatmap from the local hook log')
    .option('--weeks <n>', 'heatmap width in weeks', '17')
    .action(async (options: { weeks: string }) => {
      const { runStatusCommand } = await import('./commands/status.js')
      const weeks = Number.parseInt(options.weeks, 10)
      await runStatusCommand(Number.isFinite(weeks) && weeks > 0 ? weeks : 17)
    })

  program
    .command('flush')
    .description('retry heartbeats queued during network loss')
    .action(async () => {
      const { runFlushCommand } = await import('./commands/flush.js')
      await runFlushCommand()
    })

  program
    .command('heartbeat')
    .description('upload a single heartbeat manually (useful to test the server)')
    .requiredOption('--entity <path>', 'entity identifier (usually a file path)')
    .option('--project <name>', 'project name')
    .option('--branch <name>', 'git branch')
    .option('--language <name>', 'language')
    .option('--editor <name>', 'editor name')
    .option('--machine <name>', 'machine name')
    .option('--type <type>', 'entity type (default: file)')
    .option('--category <category>', 'category (default: coding)')
    .option('--time <iso>', 'ISO timestamp (default: now)')
    .option('--write', 'mark as a write event', false)
    .action(async (options) => {
      const { runHeartbeatCommand } = await import('./commands/heartbeat.js')
      await runHeartbeatCommand({
        entity: options.entity,
        project: options.project,
        branch: options.branch,
        language: options.language,
        editor: options.editor,
        machine: options.machine,
        type: options.type,
        category: options.category,
        time: options.time,
        write: options.write === true,
      })
    })

  program
    .command('hook')
    .description('read one agent hook payload from stdin and upload it (used by the installed hooks)')
    .requiredOption('--source <agent>', `agent that fired the hook (${agentNames}; claude aliases claude-code)`)
    .action(async (options: { source: string }) => {
      await runHookCommand(['--source', options.source])
    })

  program.addHelpText(
    'after',
    `
Examples:
  $ vakatime login --endpoint http://localhost:3000 --api-key vkt_xxx
  $ vakatime setup            # interactive agent picker
  $ vakatime setup codex
  $ vakatime status           # overview: config + hook state + activity heatmap
  $ vakatime remove codex     # uninstall the hooks for one agent
  $ echo '<hook json>' | vakatime hook --source codex`,
  )

  await program.parseAsync(process.argv)
}
