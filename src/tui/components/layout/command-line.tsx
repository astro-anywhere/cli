import React from 'react'
import { Box, Text } from 'ink'
import { useTuiStore } from '../../stores/tui-store.js'

// htop-style shortcut bar items
const SHORTCUTS = [
  { key: '?', label: 'Help' },
  { key: '/', label: 'Search' },
  { key: 'C-p', label: 'Commands' },
  { key: 'Tab', label: 'Panel' },
  { key: 'C-r', label: 'Refresh' },
  { key: 'q', label: 'Quit' },
] as const

export function CommandLine() {
  const mode = useTuiStore((s) => s.mode)
  const commandBuffer = useTuiStore((s) => s.commandBuffer)
  const searchQuery = useTuiStore((s) => s.searchQuery)

  // Palette or search input mode — show the input bar
  if (mode === 'palette') {
    return (
      <Box paddingX={1}>
        <Text bold color="yellow">&gt; </Text>
        <Text>{commandBuffer}</Text>
        <Text color="cyan">{'\u2588'}</Text>
        <Text dimColor>  (Tab to complete, Enter to run, Esc to cancel)</Text>
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
