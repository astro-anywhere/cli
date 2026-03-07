import React, { useEffect } from 'react'
import { Box, Text } from 'ink'
import { Panel } from '../layout/panel.js'
import { Spinner } from '../shared/spinner.js'
import { useProjectsStore } from '../../stores/projects-store.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { formatRelativeTime, truncate } from '../../lib/format.js'

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

  const isFocused = focusedPanel === 'projects'
  const visibleHeight = Math.max(1, height - 3)

  // Sort by updatedAt descending (most recent activity first)
  const sorted = [...projects].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return tb - ta
  })

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
          {projectCount > visibleHeight && (
            <Text dimColor>  [{start + 1}-{Math.min(start + visibleHeight, projectCount)}/{projectCount}]</Text>
          )}
        </Box>
      )}
    </Panel>
  )
}
