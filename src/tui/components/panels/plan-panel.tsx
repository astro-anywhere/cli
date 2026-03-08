import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from '../layout/panel.js'
import { ScrollableList, type ListItem } from '../shared/scrollable-list.js'
import { Spinner } from '../shared/spinner.js'
import { usePlanStore } from '../../stores/plan-store.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { useProjectsStore } from '../../stores/projects-store.js'
import { useMachinesStore } from '../../stores/machines-store.js'
import { getStatusColor, getStatusSymbol } from '../../lib/status-colors.js'
import { truncate } from '../../lib/format.js'

interface PlanPanelProps {
  height: number
}

export function PlanPanel({ height }: PlanPanelProps) {
  const nodes = usePlanStore((s) => s.nodes)
  const loading = usePlanStore((s) => s.loading)
  const error = usePlanStore((s) => s.error)
  const focusedPanel = useTuiStore((s) => s.focusedPanel)
  const scrollIndex = useTuiStore((s) => s.scrollIndex.plan)
  const selectedProjectId = useTuiStore((s) => s.selectedProjectId)
  const selectedNodeId = useTuiStore((s) => s.selectedNodeId)
  const projects = useProjectsStore((s) => s.projects)

  const isFocused = focusedPanel === 'plan'
  const project = projects.find((p) => p.id === selectedProjectId)
  const projectName = project?.name ?? 'none'
  const workDir = project?.workingDirectory ?? null
  const defaultMachineId = project?.defaultMachineId ?? null
  const machines = useMachinesStore((s) => s.machines)
  const machine = defaultMachineId ? machines.find((m) => m.id === defaultMachineId) : null
  const machineName = machine?.name ?? (defaultMachineId?.slice(0, 12) ?? null)

  // Flat list of non-deleted nodes
  const visibleNodes = nodes.filter((n) => !n.deletedAt)

  const items: ListItem[] = visibleNodes.map((n) => ({
    id: n.id,
    label: `${getStatusSymbol(n.status)} ${n.title}`,
    sublabel: `[${n.status}]`,
    color: n.id === selectedNodeId ? 'cyan' : getStatusColor(n.status) as string,
  }))

  return (
    <Panel title={`PLAN (${projectName})  d:dispatch`} isFocused={isFocused} height={height}>
      {selectedProjectId && (
        <Box gap={2}>
          <Text dimColor>Machine:</Text>
          <Text color="cyan">{machineName ?? 'none'}</Text>
          <Text dimColor>Dir:</Text>
          <Text color="cyan">{truncate(workDir ?? 'not set', 40)}</Text>
        </Box>
      )}
      {loading && nodes.length === 0 ? (
        <Spinner label="Loading plan..." />
      ) : error ? (
        <Text color="red">{error}</Text>
      ) : !selectedProjectId ? (
        <Text dimColor>  Select a project to view its plan</Text>
      ) : visibleNodes.length === 0 ? (
        <Text dimColor>  No plan nodes. Use Ctrl+P → plan create-node</Text>
      ) : (
        <ScrollableList
          items={items}
          selectedIndex={scrollIndex}
          height={height - 4}
          isFocused={isFocused}
        />
      )}
    </Panel>
  )
}
