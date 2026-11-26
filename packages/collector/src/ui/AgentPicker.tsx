import { Box, Text, useApp, useInput } from 'ink'
import { useState } from 'react'

export interface AgentPickerProps {
  agents: string[]
  /** indices pre-checked because vakatime already has hooks installed for them */
  preChecked: ReadonlySet<number>
  onSubmit: (selected: string[]) => void
}

// Minimal multi-select. ↑/↓ move, space toggles, `a` selects all, enter
// confirms, esc cancels. Kept dependency-free (no ink-select-input) so the
// collector gains nothing beyond ink/react/commander.
export function AgentPicker({ agents, preChecked, onSubmit }: AgentPickerProps) {
  const { exit } = useApp()
  const [cursor, setCursor] = useState(0)
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set(preChecked))

  const clampCursor = (next: number): number => Math.max(0, Math.min(agents.length - 1, next))

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => clampCursor(c - 1))
      return
    }
    if (key.downArrow) {
      setCursor((c) => clampCursor(c + 1))
      return
    }
    if (key.escape) {
      onSubmit([])
      exit()
      return
    }
    if (key.return) {
      onSubmit([...checked].map((index) => agents[index]).filter((a): a is string => a !== undefined))
      exit()
      return
    }
    if (input === ' ') {
      setChecked((prev) => {
        const next = new Set(prev)
        if (next.has(cursor)) {
          next.delete(cursor)
        } else {
          next.add(cursor)
        }
        return next
      })
      return
    }
    if (input === 'a') {
      setChecked(new Set(agents.map((_, index) => index)))
    }
  })

  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
      <Text bold color="magenta">
        Select agents to configure with Vakatime
      </Text>
      <Box flexDirection="column">
        {agents.map((agent, index) => {
          const isChecked = checked.has(index)
          const isCursor = index === cursor
          const wasConfigured = preChecked.has(index)
          return (
            <Text key={agent} {...(isCursor ? { color: 'cyan' as const } : {})}>
              {isCursor ? '>' : ' '}
              {isChecked ? '[x]' : '[ ]'} {agent}
              {wasConfigured && (
                <Text dimColor>
                  {' '}
                  (configured)
                </Text>
              )}
            </Text>
          )
        })}
      </Box>
      <Text dimColor>space toggle · a select all · enter confirm · esc cancel · pre-checked = already configured</Text>
    </Box>
  )
}
