import React, { useEffect, useMemo } from 'react'
import { Box, Text } from 'ink'
import { Panel } from '../layout/panel.js'
import { Spinner } from '../shared/spinner.js'
import { useProjectsStore } from '../../stores/projects-store.js'
import { useExecutionStore } from '../../stores/execution-store.js'
import { usePlanStore } from '../../stores/plan-store.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { formatRelativeTime, truncate, getVisibleProjects } from '../../lib/format.js'

/** Node statuses where execution has finished */
const TERMINAL_NODE_STATUSES = new Set([
  'completed', 'auto_verified', 'awaiting_judgment', 'awaiting_approval', 'pruned',
])

interface ProjectsPanelProps {
  height: number
}

export function ProjectsPanel({ height }: ProjectsPanelProps) {
  const projects = useProjectsStore((s) => s.projects)
  const loading = useProjectsStore((s) => s.loading)
  const error = useProjectsStore((s) => s.error)
  const focusedPanel = useTuiStore((s) => s.focusedPanel)
  const scrollIndex = useTuiStore((s) => s.scrollIndex.projects)
  const selectedProjectId = useTuiStore((s) => s.selectedProjectId)

  const outputs = useExecutionStore((s) => s.outputs)
  const planNodes = usePlanStore((s) => s.nodes)

  const isFocused = focusedPanel === 'projects'
  const visibleHeight = Math.max(1, height - 3)

  // Compute which projects have running work (matches frontend sidebar logic)
  const projectsWithRunning = useMemo(() => {
    const running = new Set<string>()

    // Running executions
    for (const [, exec] of outputs) {
      if (exec.status !== 'running' && exec.status !== 'pending' && exec.status !== 'dispatched') continue
      // Extract projectId from nodeId patterns
      const nodeId = exec.nodeId
      if (nodeId.startsWith('plan-')) {
        running.add(nodeId.replace(/^plan-/, '').replace(/-\d+$/, ''))
      } else if (nodeId.startsWith('playground-')) {
        const parts = nodeId.replace(/^playground-/, '').split('-')
        parts.pop()
        running.add(parts.join('-'))
      } else if (nodeId.startsWith('chat-')) {
        running.add(nodeId.replace(/^chat-(project-|task-)?/, '').replace(/-\d+$/, ''))
      } else {
        const node = planNodes.find((n) => n.id === nodeId)
        if (node && !TERMINAL_NODE_STATUSES.has(node.status)) {
          running.add(node.projectId)
        }
      }
    }

    // In-progress/dispatched nodes without execution records
    for (const node of planNodes) {
      if ((node.status === 'in_progress' || node.status === 'dispatched') && !node.deletedAt) {
        running.add(node.projectId)
      }
    }

    return running
  }, [outputs, planNodes])

  // Filter out playground projects, sort by updatedAt descending
  const sorted = getVisibleProjects(projects)

  const projectCount = sorted.length
  const maxIndex = Math.max(0, projectCount - 1)
  const cursor = projectCount === 0 ? 0 : Math.min(Math.max(0, scrollIndex), maxIndex)

  // Sync store if scroll index drifted out of bounds
  useEffect(() => {
    if (projectCount > 0 && scrollIndex !== cursor) {
      useTuiStore.setState((s) => ({
        scrollIndex: { ...s.scrollIndex, projects: cursor },
      }))
    }
  }, [scrollIndex, cursor, projectCount])

  // Scroll window: keep cursor visible
  let start = 0
  if (projectCount > visibleHeight) {
    if (cursor >= projectCount - visibleHeight) {
      start = projectCount - visibleHeight
    } else {
      start = Math.max(0, cursor - Math.floor(visibleHeight / 2))
    }
  }
  const visibleProjects = sorted.slice(start, start + visibleHeight)

  return (
    <Panel title="PROJECTS" isFocused={isFocused} height={height}>
      {loading && projects.length === 0 ? (
        <Spinner label="Loading projects..." />
      ) : error ? (
        <Text color="red">{error}</Text>
      ) : (
        <Box flexDirection="column">
          {visibleProjects.length === 0 && (
            <Text dimColor>  No projects yet</Text>
          )}
          {visibleProjects.map((p, i) => {
            const actualIndex = start + i
            const isSelected = isFocused && cursor === actualIndex
            const isActive = p.id === selectedProjectId
            const hasRunning = projectsWithRunning.has(p.id)
            return (
              <Box key={p.id}>
                <Text
                  inverse={isSelected}
                  bold={isSelected}
                  color={isActive ? 'cyan' : undefined}
                  wrap="truncate"
                >
                  {isSelected ? ' > ' : '   '}
                  {hasRunning ? '\u25B6 ' : '  '}
                  {truncate(p.name, 28)}
                </Text>
                <Text dimColor={!isSelected}> {formatRelativeTime(p.updatedAt)}</Text>
              </Box>
            )
          })}
          {projectCount > visibleHeight && (
            <Text dimColor>  [{start + 1}-{Math.min(start + visibleHeight, projectCount)}/{projectCount}]</Text>
          )}
        </Box>
      )}
    </Panel>
  )
}
