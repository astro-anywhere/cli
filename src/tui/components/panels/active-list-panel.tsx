/**
 * Side panel listing all active processes grouped by project.
 * Matches frontend active-tasks.tsx classification:
 * - Groups by project (not by type)
 * - Shows plan sessions as "generating", tasks as "running"/"pending"
 * - Filters out stale executions where node has terminal status
 * - Includes dispatched/in_progress nodes without execution records
 */
import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { Panel } from '../layout/panel.js'
import { useExecutionStore } from '../../stores/execution-store.js'
import { useProjectsStore } from '../../stores/projects-store.js'
import { usePlanStore } from '../../stores/plan-store.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { getShortId, truncate } from '../../lib/format.js'

interface ActiveListPanelProps {
  height: number
}

/** Node statuses where execution has finished (matches frontend TERMINAL_NODE_STATUSES) */
const TERMINAL_NODE_STATUSES = new Set([
  'completed', 'auto_verified', 'awaiting_judgment', 'awaiting_approval', 'pruned',
])

interface ActiveTask {
  nodeId: string
  projectId: string
  title: string
  status: 'running' | 'pending' | 'generating'
  executionId?: string
  startedAt?: string | null
}

function statusSymbol(status: string): string {
  if (status === 'generating') return '\u2728' // sparkles
  if (status === 'running') return '\u25B6'    // play
  if (status === 'pending') return '\u25CB'     // circle
  return '\u00B7'
}

function statusColor(status: string): string {
  if (status === 'generating') return 'magenta'
  if (status === 'running') return 'cyan'
  if (status === 'pending') return 'yellow'
  return 'gray'
}

function elapsedLabel(startedAt?: string | null): string {
  if (!startedAt) return ''
  const ms = Date.now() - new Date(startedAt).getTime()
  if (ms < 0) return ''
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  if (m > 0) return `${m}m${(s % 60).toString().padStart(2, '0')}s`
  return `${s}s`
}

interface FlatRow {
  type: 'header' | 'entry'
  label: string
  color?: string
  executionId?: string
  status?: string
  startedAt?: string | null
  taskCount?: number
}

export function ActiveListPanel({ height }: ActiveListPanelProps) {
  const outputs = useExecutionStore((s) => s.outputs)
  const watchingId = useExecutionStore((s) => s.watchingId)
  const pendingApproval = useExecutionStore((s) => s.pendingApproval)
  const mode = useTuiStore((s) => s.mode)
  const projects = useProjectsStore((s) => s.projects)
  const planNodes = usePlanStore((s) => s.nodes)

  const [cursor, setCursor] = useState(0)

  // Build active task list grouped by project (matches frontend active-tasks.tsx)
  const tasksByProject = new Map<string, ActiveTask[]>()

  // 1. Active task executions from execution store
  for (const [id, exec] of outputs) {
    if (exec.status !== 'running' && exec.status !== 'pending' && exec.status !== 'dispatched') continue

    const isPlanSession = exec.nodeId.startsWith('plan-')
    const isPlayground = exec.nodeId.startsWith('playground-')
    const isChatSession = exec.nodeId.startsWith('chat-')
    const node = (isPlanSession || isPlayground || isChatSession)
      ? undefined
      : planNodes.find((n) => n.id === exec.nodeId)

    // Filter stale: node has terminal status but execution still shows running
    if (node && TERMINAL_NODE_STATUSES.has(node.status)) continue

    // Resolve projectId
    let projectId: string | null = null
    if (node?.projectId) {
      projectId = node.projectId
    } else if (isPlanSession) {
      // plan-<projectId> or plan-<projectId>-<timestamp>
      projectId = exec.nodeId.replace(/^plan-/, '').replace(/-\d+$/, '')
    } else if (isPlayground) {
      // playground-<projectId>-<timestamp>
      const parts = exec.nodeId.replace(/^playground-/, '').split('-')
      // projectId is UUID (has dashes), take all but last part (timestamp)
      parts.pop()
      projectId = parts.join('-')
    } else if (isChatSession) {
      projectId = exec.nodeId.replace(/^chat-/, '').replace(/-\d+$/, '')
    }
    if (!projectId) continue

    // Resolve title (matches frontend resolveTitle)
    let title = exec.title
    if (!title || title === exec.nodeId) {
      if (isPlanSession) {
        title = 'Interactive Planning'
      } else if (isPlayground) {
        const proj = projects.find((p) => p.id === projectId)
        title = proj?.name ? `Playground: ${proj.name}` : 'Playground Session'
      } else {
        title = node?.title ?? `Task ${getShortId(exec.nodeId)}`
      }
    }

    const task: ActiveTask = {
      nodeId: exec.nodeId,
      projectId,
      title,
      status: isPlanSession ? 'generating' : (exec.status === 'running' ? 'running' : 'pending'),
      executionId: id,
      startedAt: exec.startedAt,
    }

    const list = tasksByProject.get(projectId) ?? []
    list.push(task)
    tasksByProject.set(projectId, list)
  }

  // 2. Also include dispatched/in_progress plan nodes without execution records
  for (const node of planNodes) {
    if (node.status !== 'in_progress' && node.status !== 'dispatched') continue
    if (node.deletedAt) continue
    // Check if already covered by execution store
    const alreadyCovered = Array.from(outputs.values()).some(
      (exec) => exec.nodeId === node.id && (exec.status === 'running' || exec.status === 'pending' || exec.status === 'dispatched'),
    )
    if (alreadyCovered) continue

    const task: ActiveTask = {
      nodeId: node.id,
      projectId: node.projectId,
      title: node.title,
      status: node.status === 'in_progress' ? 'running' : 'pending',
      startedAt: node.executionStartedAt,
    }
    const list = tasksByProject.get(node.projectId) ?? []
    list.push(task)
    tasksByProject.set(node.projectId, list)
  }

  // Sort projects: most active tasks first
  const sortedProjects = Array.from(tasksByProject.entries())
    .map(([projectId, tasks]) => {
      const project = projects.find((p) => p.id === projectId)
      return {
        projectId,
        projectName: project?.name ?? `Project ${projectId.slice(0, 8)}`,
        projectColor: project?.color,
        tasks,
      }
    })
    .sort((a, b) => b.tasks.length - a.tasks.length)

  // Build flat row list for scrolling
  const rows: FlatRow[] = []
  for (const group of sortedProjects) {
    rows.push({
      type: 'header',
      label: group.projectName,
      color: 'blue',
      taskCount: group.tasks.length,
    })
    for (const task of group.tasks) {
      rows.push({
        type: 'entry',
        label: task.title,
        executionId: task.executionId,
        status: task.status,
        startedAt: task.startedAt,
      })
    }
  }

  // Selectable indices (skip headers)
  const selectableIndices = rows.map((r, i) => r.type === 'entry' ? i : -1).filter((i) => i >= 0)

  // Clamp cursor
  useEffect(() => {
    if (selectableIndices.length > 0 && cursor >= selectableIndices.length) {
      setCursor(selectableIndices.length - 1)
    }
  }, [selectableIndices.length, cursor])

  // Keyboard navigation
  useInput((input, key) => {
    if (mode !== 'normal') return

    if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(0, c - 1))
    } else if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(selectableIndices.length - 1, c + 1))
    } else if (key.return) {
      const rowIdx = selectableIndices[cursor]
      const row = rows[rowIdx]
      if (row?.executionId) {
        useExecutionStore.getState().setWatching(row.executionId)
      }
    }
  })

  const totalCount = selectableIndices.length
  const visibleHeight = Math.max(1, height - 3)
  const cursorRowIdx = selectableIndices[cursor] ?? 0

  // Scroll window centered on cursor
  let start = 0
  if (rows.length > visibleHeight) {
    if (cursorRowIdx >= rows.length - visibleHeight) {
      start = rows.length - visibleHeight
    } else {
      start = Math.max(0, cursorRowIdx - Math.floor(visibleHeight / 2))
    }
  }
  const visibleRows = rows.slice(start, start + visibleHeight)

  const titleSuffix = totalCount > 0 ? ` (${totalCount})` : ''

  return (
    <Panel title={`ACTIVE${titleSuffix}`} isFocused={true} height={height}>
      {rows.length === 0 ? (
        <Text dimColor>  No active tasks</Text>
      ) : (
        <Box flexDirection="column">
          {visibleRows.map((row, i) => {
            const actualIndex = start + i
            if (row.type === 'header') {
              return (
                <Text key={`hdr-${actualIndex}`} bold color="blue">
                  {` ${truncate(row.label, 24)} `}
                  <Text dimColor>({row.taskCount})</Text>
                </Text>
              )
            }

            const isCursor = actualIndex === cursorRowIdx
            const isWatched = row.executionId === watchingId
            const hasApproval = pendingApproval?.taskId === row.executionId
            const elapsed = elapsedLabel(row.startedAt)

            return (
              <Box key={row.executionId ?? `row-${actualIndex}`}>
                <Text
                  color={hasApproval ? 'yellow' : isCursor ? 'cyan' : isWatched ? 'green' : statusColor(row.status!)}
                  bold={isCursor}
                  inverse={isCursor}
                  wrap="truncate"
                >
                  {isCursor ? ' > ' : isWatched ? ' * ' : '   '}
                  {hasApproval ? '!' : statusSymbol(row.status!)} {truncate(row.label, 20)}
                </Text>
                {elapsed && <Text dimColor> {elapsed}</Text>}
              </Box>
            )
          })}
          {rows.length > visibleHeight && (
            <Text dimColor>  [{start + 1}-{Math.min(start + visibleHeight, rows.length)}/{rows.length}]</Text>
          )}
        </Box>
      )}
    </Panel>
  )
}
