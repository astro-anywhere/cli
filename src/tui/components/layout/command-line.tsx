import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { useTuiStore } from '../../stores/tui-store.js'
import { getFilteredPaletteCommands } from '../../commands/palette-filter.js'

// htop-style shortcut bar items
const SHORTCUTS = [
  { key: '1', label: 'Dashboard' },
  { key: '2', label: 'Plan' },
  { key: '3', label: 'Projects' },
  { key: '4', label: 'Playground' },
  { key: '5', label: 'Output' },
  { key: '/', label: 'Search' },
  { key: 'C-p', label: 'Commands' },
  { key: 'd', label: 'Dispatch' },
  { key: '?', label: 'Help' },
  { key: 'q', label: 'Quit' },
] as const

const MAX_VISIBLE = 10

export function CommandLine() {
  const mode = useTuiStore((s) => s.mode)
  const commandBuffer = useTuiStore((s) => s.commandBuffer)
  const searchQuery = useTuiStore((s) => s.searchQuery)
  const paletteIndex = useTuiStore((s) => s.paletteIndex)
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80

  // Palette mode — show input + filtered command list
  if (mode === 'palette') {
    const filtered = getFilteredPaletteCommands(commandBuffer)
    const visible = filtered.slice(0, MAX_VISIBLE)

    return (
      <Box flexDirection="column">
        {/* Command list (above input) */}
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
          width={Math.min(60, termWidth - 4)}
        >
          {visible.length === 0 ? (
            <Text dimColor>No matching commands</Text>
          ) : (
            visible.map((cmd, i) => {
              const isSelected = i === paletteIndex
              return (
                <Box key={cmd.name}>
                  <Text
                    inverse={isSelected}
                    bold={isSelected}
                    color={isSelected ? 'yellow' : undefined}
                  >
                    {isSelected ? ' > ' : '   '}
                    {cmd.name.padEnd(20)}
                  </Text>
                  <Text dimColor={!isSelected} color={isSelected ? 'white' : undefined}>
                    {' '}{cmd.description}
                  </Text>
                </Box>
              )
            })
          )}
          {filtered.length > MAX_VISIBLE && (
            <Text dimColor>  ...and {filtered.length - MAX_VISIBLE} more</Text>
          )}
        </Box>

        {/* Input line */}
        <Box paddingX={1}>
          <Text bold color="yellow">&gt; </Text>
          <Text>{commandBuffer}</Text>
          <Text color="cyan">{'\u2588'}</Text>
          <Text dimColor>  ({'\u2191\u2193'} navigate, Enter to run, Esc to cancel)</Text>
        </Box>
      </Box>
    )
  }

  if (mode === 'search') {
    return (
      <Box paddingX={1}>
        <Text bold color="green">/ </Text>
        <Text>{searchQuery}</Text>
        <Text color="cyan">{'\u2588'}</Text>
        <Text dimColor>  (Enter to search, Esc to cancel)</Text>
      </Box>
    )
  }

  if (mode === 'input') {
    return (
      <Box paddingX={1}>
        <Text dimColor>Input active — press Esc to exit</Text>
      </Box>
    )
  }

  // Normal mode — htop-style function key bar
  return (
    <Box paddingX={1} gap={1}>
      {SHORTCUTS.map(({ key, label }) => (
        <Box key={key}>
          <Text inverse bold>{` ${key} `}</Text>
          <Text>{label}</Text>
        </Box>
      ))}
    </Box>
  )
}
