import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from '../layout/panel.js'
import { Spinner } from '../shared/spinner.js'
import { useProjectsStore } from '../../stores/projects-store.js'
import { useExecutionStore } from '../../stores/execution-store.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { formatRelativeTime, truncate } from '../../lib/format.js'

interface ProjectsPanelProps {
  height: number
}

function statusSymbol(status: string): string {
  if (status === 'running') return '\u25B6'
  if (status === 'success') return '\u2713'
  if (status === 'failure' || status === 'error') return '\u2717'
  return '\u00B7'
}

export function ProjectsPanel({ height }: ProjectsPanelProps) {
  const projects = useProjectsStore((s) => s.projects)
  const loading = useProjectsStore((s) => s.loading)
  const error = useProjectsStore((s) => s.error)
  const focusedPanel = useTuiStore((s) => s.focusedPanel)
  const scrollIndex = useTuiStore((s) => s.scrollIndex.projects)
  const selectedProjectId = useTuiStore((s) => s.selectedProjectId)
  const outputs = useExecutionStore((s) => s.outputs)

  const isFocused = focusedPanel === 'projects'
  const visibleHeight = Math.max(1, height - 3)

  // Collect plan gen and playground entries from execution store
  const planGenEntries: { id: string; label: string; status: string }[] = []
  const playgroundEntries: { id: string; label: string; status: string }[] = []
  for (const [id, exec] of outputs) {
    if (exec.nodeId.startsWith('plan-')) {
      planGenEntries.push({ id, label: exec.nodeId, status: exec.status })
    } else if (exec.nodeId.startsWith('playground-')) {
      playgroundEntries.push({ id, label: exec.nodeId.replace(/^playground-/, '').slice(0, 30), status: exec.status })
    }
  }

  // Build flat list of rows for scrolling — projects are the selectable items
  // Section headers and session entries are rendered below projects
  const projectCount = projects.length

  // Scroll window for projects
  const clampedIndex = Math.min(scrollIndex, Math.max(0, projectCount - 1))

  // Reserve lines for section headers/entries below projects
  const sectionLineCount =
    (planGenEntries.length > 0 ? 1 + planGenEntries.length : 0) +
    (playgroundEntries.length > 0 ? 1 + playgroundEntries.length : 0)
  const projectVisibleHeight = Math.max(1, visibleHeight - sectionLineCount)

  // Scroll window
  let start = 0
  if (projectCount > projectVisibleHeight) {
    start = Math.max(0, Math.min(clampedIndex - Math.floor(projectVisibleHeight / 2), projectCount - projectVisibleHeight))
  }
  const visibleProjects = projects.slice(start, start + projectVisibleHeight)

  return (
    <Panel title="PROJECTS" isFocused={isFocused} height={height}>
      {loading && projects.length === 0 ? (
        <Spinner label="Loading projects..." />
      ) : error ? (
        <Text color="red">{error}</Text>
      ) : (
        <Box flexDirection="column">
          {visibleProjects.length === 0 && planGenEntries.length === 0 && playgroundEntries.length === 0 && (
            <Text dimColor>  No projects yet</Text>
          )}
          {visibleProjects.map((p, i) => {
            const actualIndex = start + i
            const isSelected = isFocused && clampedIndex === actualIndex
            const isActive = p.id === selectedProjectId
            return (
              <Box key={p.id}>
                <Text
                  inverse={isSelected}
                  bold={isSelected}
                  color={isActive ? 'cyan' : undefined}
                  wrap="truncate"
                >
                  {isSelected ? ' > ' : '   '}
                  {truncate(p.name, 30)}
                </Text>
                <Text dimColor={!isSelected}> {formatRelativeTime(p.updatedAt)}</Text>
              </Box>
            )
          })}
          {projectCount > projectVisibleHeight && (
            <Text dimColor>  [{start + 1}-{Math.min(start + projectVisibleHeight, projectCount)}/{projectCount}]</Text>
          )}

          {planGenEntries.length > 0 && (
            <>
              <Text bold color="yellow"> Plan Generation</Text>
              {planGenEntries.map((item) => (
                <Text key={item.id} dimColor wrap="truncate">
                  {'   '}{statusSymbol(item.status)} {truncate(item.label, 28)} {item.status}
                </Text>
              ))}
            </>
          )}

          {playgroundEntries.length > 0 && (
            <>
              <Text bold color="green"> Playground</Text>
              {playgroundEntries.map((item) => (
                <Text key={item.id} dimColor wrap="truncate">
                  {'   '}{statusSymbol(item.status)} {truncate(item.label, 28)} {item.status}
                </Text>
              ))}
            </>
          )}
        </Box>
      )}
    </Panel>
  )
}
