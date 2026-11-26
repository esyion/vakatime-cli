import { Box, Text } from 'ink'

export interface StatusData {
  configPath: string
  endpoint: string | null
  apiKeyMasked: string | null
  queued: number
  hookLogPath: string
  agents: { name: string; configured: boolean }[]
}

export function StatusPanel({ data }: { data: StatusData }) {
  const configured = data.endpoint !== null && data.apiKeyMasked !== null
  const anyConfigured = data.agents.some((agent) => agent.configured)
  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
      <Text bold color="magenta">
        vakatime collector
      </Text>
      <Box flexDirection="column">
        <Text>
          config:{'   '}
          <Text color="green">{data.configPath}</Text>
        </Text>
        <Text>
          endpoint:{' '}
          <Text color={data.endpoint === null ? 'red' : 'green'}>
            {data.endpoint ?? 'not configured'}
          </Text>
        </Text>
        <Text>
          api key:{'  '}
          <Text color={data.apiKeyMasked === null ? 'red' : 'green'}>
            {data.apiKeyMasked ?? 'not configured'}
          </Text>
        </Text>
        <Text>
          queued:{'   '}
          <Text color={data.queued === 0 ? 'green' : 'yellow'}>
            {data.queued} heartbeats
          </Text>
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text>agents:</Text>
        <Text>
          {data.agents.map((agent, index) => (
            <Text key={agent.name}>
              {index > 0 ? ' ' : ''}
              <Text color={agent.configured ? 'green' : 'gray'}>{agent.configured ? '✓' : '·'}</Text>{' '}
              <Text {...(agent.configured ? { color: 'green' as const } : {})}>{agent.name}</Text>
            </Text>
          ))}
        </Text>
        {!anyConfigured && (
          <Text dimColor>Run `vakatime setup &lt;agent&gt;` (or bare `vakatime setup`) to install hooks.</Text>
        )}
      </Box>
      <Text dimColor>log: {data.hookLogPath}</Text>
      {!configured && <Text color="yellow">Run `vakatime login --endpoint &lt;url&gt; --api-key &lt;key&gt;` to start.</Text>}
    </Box>
  )
}
