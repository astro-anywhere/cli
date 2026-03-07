/**
 * Interactive agent session panel — combines execution output with user input.
 * Used for Playground and Plan Generation views (like a Claude Code session).
 */
import React from 'react'
import { Box, Text } from 'ink'
import { TextInput } from '@inkjs/ui'
import { Panel } from '../layout/panel.js'
import { Spinner } from '../shared/spinner.js'
import { useExecutionStore } from '../../stores/execution-store.js'
import { useChatStore } from '../../stores/chat-store.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { truncate } from '../../lib/format.js'

interface SessionPanelProps {
  height: number
  title: string
  sessionType: 'playground' | 'plan-generate'
  onSubmit?: (message: string) => void
}

function lineColor(line: string): string | undefined {
  if (line.startsWith('[Tool Call]')) return 'gray'
  if (line.startsWith('[error]')) return 'red'
  if (line.startsWith('[progress]')) return 'cyan'
  if (line.startsWith('[plan]')) return 'magenta'
  if (line.startsWith('[created]') || line.startsWith('[modified]') || line.startsWith('[deleted]')) return 'yellow'
  if (line.startsWith('> ')) return 'cyan'
  return undefined
}

export function SessionPanel({ height, title, sessionType, onSubmit }: SessionPanelProps) {
  const watchingId = useExecutionStore((s) => s.watchingId)
  const outputs = useExecutionStore((s) => s.outputs)
  const streaming = useChatStore((s) => s.streaming)
  const mode = useTuiStore((s) => s.mode)

  const execution = watchingId ? outputs.get(watchingId) : null
  const isRunning = execution?.status === 'running'
  const inputHeight = 2
  const outputHeight = Math.max(1, height - 5 - inputHeight) // border + title + input area

  // Determine if we should accept input
  const isInputActive = mode === 'input'

  // Build display: execution output lines
  const lines = execution?.lines ?? []
  const hasPendingTools = (execution?.pendingToolCount ?? 0) > 0

  // Auto-scroll to bottom
  const start = Math.max(0, lines.length - outputHeight)
  const visibleLines = lines.slice(start, start + outputHeight)

  let statusLabel = ''
  if (execution) {
    statusLabel = ` [${execution.status}]`
  }

  const hint = sessionType === 'playground'
    ? 'Describe what you want to build or explore'
    : 'Describe the plan you want to generate'

  return (
    <Panel title={`${title}${statusLabel}`} isFocused={true} height={height}>
      <Box flexDirection="column">
        {/* Output area */}
        <Box flexDirection="column" height={outputHeight}>
          {visibleLines.length === 0 && !isRunning ? (
            <Text dimColor>  {hint}. Type below and press Enter.</Text>
          ) : (
            visibleLines.map((line, i) => (
              <Text key={start + i} color={lineColor(line)} dimColor={line.startsWith('[Tool Call]')} wrap="truncate">
                {truncate(line, 200)}
              </Text>
            ))
          )}
          {hasPendingTools && (
            <Text dimColor>
              {'[Tool Call] ' + '\u00B7'.repeat(execution!.pendingToolCount)}
            </Text>
          )}
          {isRunning && !hasPendingTools && (
            <Spinner label="Running..." />
          )}
        </Box>

        {/* Scroll indicator */}
        {lines.length > outputHeight && (
          <Text dimColor>  [{start + 1}-{Math.min(start + outputHeight, lines.length)}/{lines.length}]</Text>
        )}

        {/* Input area */}
        <Box borderStyle="single" borderColor={isInputActive ? 'cyan' : 'gray'} paddingX={1}>
          {isRunning || streaming ? (
            <Box>
              <Spinner />
              <Text dimColor> Agent is working... (press Esc to return to navigation)</Text>
            </Box>
          ) : (
            <Box>
              <Text color="cyan">&gt; </Text>
              {isInputActive ? (
                <TextInput
                  placeholder={hint}
                  onSubmit={(value) => {
                    if (value.trim()) {
                      const msg = value.trim()
                      // Show user message in output immediately for feedback
                      if (watchingId) {
                        useExecutionStore.getState().appendLine(watchingId, `> ${msg}`)
                      } else {
                        // No execution yet — create a temporary placeholder so user sees their input
                        const tmpId = `pending-${Date.now()}`
                        useExecutionStore.getState().initExecution(tmpId, tmpId, `${sessionType === 'playground' ? 'Playground' : 'Plan'}: ${msg.slice(0, 50)}`)
                        useExecutionStore.getState().setWatching(tmpId)
                        useExecutionStore.getState().appendLine(tmpId, `> ${msg}`)
                        useExecutionStore.getState().appendLine(tmpId, '[progress] Starting...')
                      }
                      useChatStore.getState().addMessage('user', msg)
                      onSubmit?.(msg)
                    }
                  }}
                />
              ) : (
                <Text dimColor>Press Enter to start typing...</Text>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Panel>
  )
}
