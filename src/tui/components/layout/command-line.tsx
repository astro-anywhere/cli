import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { useTuiStore } from '../../stores/tui-store.js'
import { useSearchStore } from '../../stores/search-store.js'
import { getFilteredPaletteCommands } from '../../commands/palette-filter.js'
import { getStatusColor } from '../../lib/status-colors.js'

const SHORTCUTS = [
  { key: '1', label: 'Dashboard' },
  { key: '2', label: 'Plan' },
  { key: '3', label: 'Projects' },
  { key: '4', label: 'Playground' },
  { key: '5', label: 'Active' },
  { key: '/', label: 'Search' },
  { key: 'C-p', label: 'Commands' },
  { key: 'd', label: 'Dispatch' },
  { key: 'x', label: 'Stop' },
  { key: '?', label: 'Help' },
  { key: 'q', label: 'Quit' },
] as const

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  project: { label: 'proj', color: 'cyan' },
  task: { label: 'task', color: 'yellow' },
  machine: { label: 'env', color: 'green' },
  execution: { label: 'exec', color: 'magenta' },
}

interface CommandLineProps {
  height: number
}

export function CommandLine({ height }: CommandLineProps) {
  const mode = useTuiStore((s) => s.mode)
  const commandBuffer = useTuiStore((s) => s.commandBuffer)
  const paletteIndex = useTuiStore((s) => s.paletteIndex)

  const searchOpen = useSearchStore((s) => s.isOpen)
  const searchQuery = useSearchStore((s) => s.query)
  const searchResults = useSearchStore((s) => s.results)
  const searchItems = useSearchStore((s) => s.items)
  const searchIndex = useSearchStore((s) => s.selectedIndex)

  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80

  // List height = total height minus 2 (input line + border)
  const listHeight = Math.max(1, height - 3)

  // Search panel — half-screen bottom panel
  if (searchOpen) {
    const displayList = searchQuery.length > 0 ? searchResults : searchItems
    const visible = displayList.slice(0, listHeight)

    return (
      <Box flexDirection="column" height={height} borderStyle="single" borderColor="cyan" paddingX={1}>
        {/* Input line at top */}
        <Box>
          <Text bold color="cyan">/ </Text>
          <Text>{searchQuery}</Text>
          <Text color="cyan">{'\u2588'}</Text>
          <Text dimColor>  ({'\u2191\u2193'} navigate, Enter to go, Esc to close)</Text>
        </Box>

        {/* Results list */}
        <Box flexDirection="column" marginTop={1}>
          {visible.length === 0 ? (
            <Text dimColor>{searchQuery.length > 0 ? '  No results' : '  No items'}</Text>
          ) : (
            visible.map((item, i) => {
              const isSelected = i === searchIndex
              const typeInfo = TYPE_LABELS[item.type] ?? { label: item.type, color: 'white' }
              return (
                <Box key={`${item.type}-${item.id}`}>
                  <Text inverse={isSelected} bold={isSelected} color={isSelected ? 'cyan' : undefined}>
                    {isSelected ? ' > ' : '   '}
                  </Text>
                  <Text inverse={isSelected} color={isSelected ? 'cyan' : typeInfo.color}>
                    [{typeInfo.label}]
                  </Text>
                  <Text inverse={isSelected} bold={isSelected} wrap="truncate">
                    {' '}{item.title}
                  </Text>
                  {item.status && (
                    <Text inverse={isSelected} color={isSelected ? undefined : getStatusColor(item.status)} dimColor={!isSelected}>
                      {' '}{item.status}
                    </Text>
                  )}
                </Box>
              )
            })
          )}
          {displayList.length > listHeight && (
            <Text dimColor>  ...and {displayList.length - listHeight} more</Text>
          )}
        </Box>
      </Box>
    )
  }

  // Command palette — half-screen bottom panel
  if (mode === 'palette') {
    const filtered = getFilteredPaletteCommands(commandBuffer)
    const visible = filtered.slice(0, listHeight)

    return (
      <Box flexDirection="column" height={height} borderStyle="single" borderColor="yellow" paddingX={1}>
        {/* Input line at top */}
        <Box>
          <Text bold color="yellow">&gt; </Text>
          <Text>{commandBuffer}</Text>
          <Text color="cyan">{'\u2588'}</Text>
          <Text dimColor>  ({'\u2191\u2193'} navigate, Enter to run, Esc to cancel)</Text>
        </Box>

        {/* Command list */}
        <Box flexDirection="column" marginTop={1}>
          {visible.length === 0 ? (
            <Text dimColor>  No matching commands</Text>
          ) : (
            visible.map((cmd, i) => {
              const isSelected = i === paletteIndex
              return (
                <Box key={cmd.name}>
                  <Text inverse={isSelected} bold={isSelected} color={isSelected ? 'yellow' : undefined}>
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
          {filtered.length > listHeight && (
            <Text dimColor>  ...and {filtered.length - listHeight} more</Text>
          )}
        </Box>
      </Box>
    )
  }

  if (mode === 'input') {
    return (
      <Box paddingX={1} gap={1} height={height}>
        <Text dimColor>Input active</Text>
        <Box><Text inverse bold>{' C-d '}</Text><Text>Stop</Text></Box>
        <Box><Text inverse bold>{' Esc '}</Text><Text>Exit input</Text></Box>
      </Box>
    )
  }

  // Normal mode — htop-style function key bar
  return (
    <Box paddingX={1} gap={1} height={height}>
      {SHORTCUTS.map(({ key, label }) => (
        <Box key={key}>
          <Text inverse bold>{` ${key} `}</Text>
          <Text>{label}</Text>
        </Box>
      ))}
    </Box>
  )
}
