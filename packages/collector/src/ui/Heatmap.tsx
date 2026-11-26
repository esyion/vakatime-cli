import { Box, Text } from 'ink'
import { buildHeatmapGrid, heatLevel, HEAT_LEVELS } from '../stats.js'
import type { HookLogSummary } from '../stats.js'

// GitHub contribution-graph palette. Chalk degrades truecolor to the nearest
// ANSI-256/16 color on older terminals.
const LEVEL_BG = ['#1f2328', '#0e4429', '#006d32', '#26a641', '#39d353'] as const

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function MonthLabels({ columns }: { columns: { date: string }[][] }) {
  // Label a column when it is the first week containing the 1st..7th of a month.
  const labels: (string | null)[] = columns.map(() => null)
  let lastMonth = -1
  columns.forEach((column, index) => {
    const firstCell = column[0]
    if (firstCell === undefined) return
    const month = Number(firstCell.date.slice(5, 7)) - 1
    if (month !== lastMonth) {
      labels[index] = MONTH_LABELS[month] ?? null
      lastMonth = month
    }
  })
  return (
    <Box flexDirection="row">
      <Box width={5}>
        <Text> </Text>
      </Box>
      {labels.map((label, index) => (
        <Box key={`m-${index}`} width={4}>
          <Text dimColor>{label ?? ' '}</Text>
        </Box>
      ))}
    </Box>
  )
}

export function Heatmap({ summary, weeks }: { summary: HookLogSummary; weeks: number }) {
  const grid = buildHeatmapGrid(summary, weeks)
  return (
    <Box flexDirection="column" gap={1}>
      <MonthLabels columns={grid.columns} />
      <Box flexDirection="row">
        <Box flexDirection="column">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, row) => (
            <Text key={day} dimColor>
              {row === 1 || row === 3 || row === 5 ? `${day} ` : '    '}
            </Text>
          ))}
        </Box>
        {grid.columns.map((column, columnIndex) => (
          <Box key={`w-${columnIndex}`} flexDirection="column">
            {column.map((cell) => {
              if (cell.future) {
                return (
                  <Text key={cell.date}>  </Text>
                )
              }
              const level = heatLevel(cell.count)
              const bg = LEVEL_BG[level] ?? LEVEL_BG[0]
              return (
                <Text key={cell.date} backgroundColor={bg} {...(level === 0 ? {} : { color: '#e6edf3' as const })}>
                  {level === 0 ? '  ' : String(Math.min(cell.count, 99)).padStart(2, ' ')}
                </Text>
              )
            })}
          </Box>
        ))}
      </Box>
      <Text dimColor>
        {grid.totalInRange} events in the last {grid.weeks} weeks
      </Text>
    </Box>
  )
}
