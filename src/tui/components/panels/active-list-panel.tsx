/**
 * Side panel listing all active processes grouped by type.
 * Supports keyboard navigation — selecting an item sets it as watched.
 */
import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { Panel } from '../layout/panel.js'
import { useExecutionStore } from '../../stores/execution-store.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { formatRelativeTime, truncate } from '../../lib/format.js'

interface ActiveListPanelProps {
  height: number
}

function statusSymbol(status: string): string {
  if (status === 'running') return '\u25B6'
  if (status === 'success' || status === 'completed') return '\u2713'
  if (status === 'failure' || status === 'error') return '\u2717'
  if (status === 'cancelled') return '\u2715'
  return '\u00B7'
}

function statusColor(status: string): string | undefined {
  if (status === 'running') return 'cyan'
  if (status === 'success' || status === 'completed') return 'green'
  if (status === 'failure' || status === 'error') return 'red'
  if (status === 'cancelled') return 'yellow'
  return undefined
}

function categorize(nodeId: string): string {
  if (nodeId.startsWith('playground-')) return 'Playground'
  if (nodeId.startsWith('plan-')) return 'Plan Generation'
  return 'Task Execution'
}

const CATEGORY_ORDER = ['Task Execution', 'Playground', 'Plan Generation']
const CATEGORY_COLOR: Record<string, string> = {
  'Task Execution': 'blue',
  'Playground': 'green',
  'Plan Generation': 'yellow',
}

interface FlatRow {
  type: 'header' | 'entry'
  label: string
  color?: string
  executionId?: string
  status?: string
  startedAt?: string | null
}

export function ActiveListPanel({ height }: ActiveListPanelProps) {
  const outputs = useExecutionStore((s) => s.outputs)
  const watchingId = useExecutionStore((s) => s.watchingId)
  const mode = useTuiStore((s) => s.mode)

  const [cursor, setCursor] = useState(0)

  // Group entries by category
  const grouped = new Map<string, Array<{ id: string; title: string; status: string; startedAt: string | null }>>()
  // Only show actively running processes
  for (const [id, exec] of outputs) {
    if (exec.status !== 'running' && exec.status !== 'pending' && exec.status !== 'dispatched') continue
    const cat = categorize(exec.nodeId)
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push({
      id,
      title: exec.title,
      status: exec.status,
      startedAt: exec.startedAt,
    })
  }

  // Sort within groups: running first, then by time
  for (const entries of grouped.values()) {
    entries.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (b.status === 'running' && a.status !== 'running') return 1
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0
      return tb - ta
    })
  }

  // Build flat row list for scrolling (headers + entries)
  const rows: FlatRow[] = []
  for (const cat of CATEGORY_ORDER) {
    const entries = grouped.get(cat)
    if (!entries || entries.length === 0) continue
    rows.push({ type: 'header', label: `${cat} (${entries.length})`, color: CATEGORY_COLOR[cat] })
    for (const entry of entries) {
      rows.push({
        type: 'entry',
        label: entry.title,
        executionId: entry.id,
        status: entry.status,
        startedAt: entry.startedAt,
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

  return (
    <Panel title="ACTIVE" isFocused={true} height={height}>
      {rows.length === 0 ? (
        <Text dimColor>  No active processes</Text>
      ) : (
        <Box flexDirection="column">
          {visibleRows.map((row, i) => {
            const actualIndex = start + i
            if (row.type === 'header') {
              return (
                <Text key={`hdr-${row.label}`} bold color={row.color ?? 'white'}>
                  {` ${row.label}`}
                </Text>
              )
            }

            const isCursor = actualIndex === cursorRowIdx
            const isWatched = row.executionId === watchingId
            return (
              <Box key={row.executionId}>
                <Text
                  color={isCursor ? 'cyan' : isWatched ? 'green' : statusColor(row.status!)}
                  bold={isCursor}
                  inverse={isCursor}
                  wrap="truncate"
                >
                  {isCursor ? ' > ' : isWatched ? ' * ' : '   '}
                  {statusSymbol(row.status!)} {truncate(row.label, 22)}
                </Text>
                <Text dimColor> {formatRelativeTime(row.startedAt)}</Text>
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
