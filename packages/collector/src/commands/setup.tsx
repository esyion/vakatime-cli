import { listSupportedAgents, setupAgent, type AgentType } from '../setup.js'

export async function runSetupCommand(agent: string | undefined): Promise<void> {
  const supported = listSupportedAgents()

  if (agent !== undefined) {
    if (!supported.includes(agent)) {
      console.error(`setup requires a valid agent: ${supported.join(', ')}`)
      process.exit(1)
    }
    setupAgent(agent as AgentType)
    return
  }

  // No agent argument — interactive multi-select via Ink. Only here do we
  // pay the ink/react import cost; direct `setup <agent>` stays light.
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error(`Interactive setup needs a TTY. Pass an agent: vakatime setup ${supported.join('|')}`)
    process.exit(1)
  }

  const selected = await new Promise<string[]>((resolve) => {
    void (async () => {
      const { render } = await import('ink')
      const { AgentPicker } = await import('../ui/AgentPicker.js')
      const instance = render(<AgentPicker agents={supported} onSubmit={(picked) => resolve(picked)} />)
      void instance.waitUntilExit()
    })()
  })

  if (selected.length === 0) {
    console.log('No agents selected — nothing changed.')
    return
  }
  for (const picked of selected) {
    setupAgent(picked as AgentType)
  }
}
