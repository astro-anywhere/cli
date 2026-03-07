import React from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import { useSearchStore } from '../../stores/search-store.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { getStatusColor } from '../../lib/status-colors.js'

const MAX_VISIBLE = 12

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  project: { label: 'proj', color: 'cyan' },
  task: { label: 'task', color: 'yellow' },
  machine: { label: 'env', color: 'green' },
  execution: { label: 'exec', color: 'magenta' },
}

export function SearchOverlay() {
  const isOpen = useSearchStore((s) => s.isOpen)
  const query = useSearchStore((s) => s.query)
  const results = useSearchStore((s) => s.results)
  const items = useSearchStore((s) => s.items)
  const selectedIndex = useSearchStore((s) => s.selectedIndex)
  const { setQuery, moveUp, moveDown, close } = useSearchStore()
  const { setSelectedProject, setSelectedNode, setSelectedMachine, focusPanel, openDetail } = useTuiStore()
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80

  useInput((input, key) => {
    if (!isOpen) return

    if (key.escape) {
      close()
      return
    }

    if (key.upArrow) {
      moveUp()
      return
    }

    if (key.downArrow || key.tab) {
      moveDown()
      return
    }

    if (key.return) {
      const displayList = query.length > 0 ? results : items
      const item = displayList[selectedIndex]
      if (item) {
        switch (item.type) {
          case 'project':
            setSelectedProject(item.id)
            focusPanel('projects')
            break
          case 'task':
            setSelectedNode(item.id)
            focusPanel('plan')
            openDetail('node', item.id)
            break
          case 'machine':
            setSelectedMachine(item.id)
            focusPanel('machines')
            break
        }
      }
      close()
      return
    }

    if (key.backspace || key.delete) {
      setQuery(query.slice(0, -1))
      return
    }

    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setQuery(query + input)
    }
  }, { isActive: isOpen })

  if (!isOpen) return null

  // Show all items when query is empty, filtered results otherwise
  const displayList = query.length > 0 ? results : items
  const visible = displayList.slice(0, MAX_VISIBLE)

  return (
    <Box flexDirection="column" position="absolute" marginTop={2} marginLeft={Math.floor(termWidth * 0.1)}>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
        width={Math.min(70, termWidth - 8)}
      >
        {/* Search input */}
        <Box>
          <Text bold color="cyan">/ </Text>
          <Text>{query}</Text>
          <Text color="cyan">{'\u2588'}</Text>
          <Text dimColor>  ({'\u2191\u2193'} navigate, Enter to go, Esc to close)</Text>
        </Box>

        {/* Results list */}
        <Box flexDirection="column" marginTop={1}>
          {visible.length === 0 ? (
            <Text dimColor>  {query.length > 0 ? 'No results' : 'No items to search'}</Text>
          ) : (
            visible.map((item, i) => {
              const isSelected = i === selectedIndex
              const typeInfo = TYPE_LABELS[item.type] ?? { label: item.type, color: 'white' }
              return (
                <Box key={`${item.type}-${item.id}`}>
                  <Text
                    inverse={isSelected}
                    bold={isSelected}
                    color={isSelected ? 'cyan' : undefined}
                  >
                    {isSelected ? ' > ' : '   '}
                  </Text>
                  <Text
                    inverse={isSelected}
                    color={isSelected ? 'cyan' : typeInfo.color}
                  >
                    [{typeInfo.label}]
                  </Text>
                  <Text
                    inverse={isSelected}
                    bold={isSelected}
                  >
                    {' '}{item.title}
                  </Text>
                  {item.status && (
                    <Text
                      inverse={isSelected}
                      color={isSelected ? undefined : getStatusColor(item.status)}
                      dimColor={!isSelected}
                    >
                      {' '}{item.status}
                    </Text>
                  )}
                </Box>
              )
            })
          )}
          {displayList.length > MAX_VISIBLE && (
            <Text dimColor>  ...and {displayList.length - MAX_VISIBLE} more</Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}
