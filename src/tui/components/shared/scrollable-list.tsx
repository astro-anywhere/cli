import React from 'react'
import { Box, Text, useStdout } from 'ink'

export interface ListItem {
  id: string
  label: string
  sublabel?: string
  rightLabel?: string
  color?: string
}

interface ScrollableListProps {
  items: ListItem[]
  selectedIndex: number
  height: number
  isFocused: boolean
}

export function ScrollableList({ items, selectedIndex, height, isFocused }: ScrollableListProps) {
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80

  if (items.length === 0) {
    return (
      <Box>
        <Text dimColor>  No items.</Text>
      </Box>
    )
  }

  // Clamp index to valid range
  const cursor = Math.min(Math.max(0, selectedIndex), items.length - 1)

  // Calculate visible window
  const visibleHeight = Math.max(1, height - 1)
  let start = 0
  if (items.length > visibleHeight) {
    if (cursor >= items.length - visibleHeight) {
      start = items.length - visibleHeight
    } else {
      start = Math.max(0, cursor - Math.floor(visibleHeight / 2))
    }
  }
  const visibleItems = items.slice(start, start + visibleHeight)

  return (
    <Box flexDirection="column">
      {visibleItems.map((item, i) => {
        const actualIndex = start + i
        const isSelected = actualIndex === cursor && isFocused
        const prefix = isSelected ? ' \u25B6 ' : '   '
        const sublabel = item.sublabel ? ` ${item.sublabel}` : ''
        const rightLabel = item.rightLabel ?? ''

        // Truncate to fit terminal width (approximate, accounting for borders/padding)
        const maxLabelWidth = Math.max(10, termWidth - prefix.length - sublabel.length - rightLabel.length - 10)
        const truncatedLabel = item.label.length > maxLabelWidth
          ? item.label.slice(0, maxLabelWidth - 1) + '\u2026'
          : item.label

        return (
          <Box key={item.id}>
            <Text
              color={isSelected ? 'cyan' : item.color ?? undefined}
              bold={isSelected}
              inverse={isSelected}
              wrap="truncate"
            >
              {prefix}{truncatedLabel}{sublabel}
            </Text>
            {rightLabel && (
              <Text dimColor> {rightLabel}</Text>
            )}
          </Box>
        )
      })}
      {items.length > visibleHeight && (
        <Text dimColor>  [{start + 1}-{Math.min(start + visibleHeight, items.length)}/{items.length}]</Text>
      )}
    </Box>
  )
}
