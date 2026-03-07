import React from 'react'
import { Box, Text } from 'ink'
import { useTuiStore, type ViewId } from '../../stores/tui-store.js'
import { formatCost } from '../../lib/format.js'

const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: 'Dashboard',
  'plan-gen': 'Plan',
  projects: 'Projects',
  playground: 'Playground',
  output: 'Output',
}

export function StatusBar() {
  const connected = useTuiStore((s) => s.connected)
  const machineCount = useTuiStore((s) => s.machineCount)
  const todayCost = useTuiStore((s) => s.todayCost)
  const lastError = useTuiStore((s) => s.lastError)
  const activeView = useTuiStore((s) => s.activeView)

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box gap={2}>
        <Text bold color="cyan">Astro</Text>
        <Text color={connected ? 'green' : 'red'}>
          {connected ? '\u25CF' : '\u25CB'}
        </Text>
        <Text dimColor>{machineCount} machine{machineCount !== 1 ? 's' : ''}</Text>
        <Text dimColor>{formatCost(todayCost)}</Text>
        <Text bold color="yellow">[{VIEW_LABELS[activeView]}]</Text>
      </Box>
      {lastError && (
        <Box>
          <Text color="red">{lastError.length > 50 ? lastError.slice(0, 47) + '...' : lastError}</Text>
        </Box>
      )}
    </Box>
  )
}
