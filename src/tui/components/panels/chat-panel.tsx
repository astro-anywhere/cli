import React from 'react'
import { Box, Text } from 'ink'
import { TextInput } from '@inkjs/ui'
import { Panel } from '../layout/panel.js'
import { useChatStore } from '../../stores/chat-store.js'
import { Spinner } from '../shared/spinner.js'

interface ChatPanelProps {
  height: number
}

export function ChatPanel({ height }: ChatPanelProps) {
  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const streamBuffer = useChatStore((s) => s.streamBuffer)
  const sessionId = useChatStore((s) => s.sessionId)

  // Build display lines
  const displayLines: Array<{ key: string; text: string; color?: string }> = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const prefix = m.role === 'user' ? '> ' : '  '
    displayLines.push({ key: `msg-${i}`, text: `${prefix}${m.content}`, color: m.role === 'user' ? 'cyan' : undefined })
  }
  if (streaming && streamBuffer) {
    displayLines.push({ key: 'stream', text: `  ${streamBuffer}` })
  }

  // Show the most recent messages that fit
  const contentHeight = height - 4 // border + title + input
  const visibleLines = displayLines.slice(-Math.max(1, contentHeight))

  const titleSuffix = sessionId ? ` (${sessionId.slice(0, 8)})` : ''

  return (
    <Panel title={`Chat${titleSuffix}`} isFocused={false} height={height}>
      <Box flexDirection="column">
        <Box flexDirection="column" height={Math.max(1, contentHeight - 1)}>
          {visibleLines.map((line) => (
            <Text key={line.key} color={line.color as 'cyan' | undefined} wrap="truncate">
              {line.text}
            </Text>
          ))}
        </Box>
        <Box>
          {streaming ? (
            <Box>
              <Spinner />
              <Text dimColor> Streaming...</Text>
            </Box>
          ) : (
            <Box>
              <Text color="cyan">&gt; </Text>
              <TextInput
                placeholder="Type a message..."
                onSubmit={(value) => {
                  if (value.trim()) {
                    useChatStore.getState().addMessage('user', value.trim())
                  }
                }}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Panel>
  )
}
