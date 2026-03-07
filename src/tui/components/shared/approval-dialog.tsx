import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

export interface ApprovalDialogProps {
  question: string
  options: string[]
  onSelect: (index: number) => void
  onDismiss: () => void
}

export function ApprovalDialog({ question, options, onSelect, onDismiss }: ApprovalDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input, key) => {
    if (key.escape) {
      onDismiss()
      return
    }

    if (key.return) {
      onSelect(selectedIndex)
      return
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1))
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(options.length - 1, i + 1))
    }

    // Number keys for quick selection
    const num = parseInt(input, 10)
    if (num >= 1 && num <= options.length) {
      onSelect(num - 1)
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      paddingY={0}
    >
      <Text color="yellow" bold>Approval Required</Text>
      <Text wrap="wrap">{question}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Box key={i}>
            <Text color={i === selectedIndex ? 'cyan' : 'white'}>
              {i === selectedIndex ? '▸ ' : '  '}
              [{i + 1}] {opt}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓/jk navigate • Enter select • 1-{options.length} quick select • Esc dismiss</Text>
      </Box>
    </Box>
  )
}
