import React from 'react'
import { Box, Text } from 'ink'

const KEYBINDINGS = [
  ['Navigation', [
    ['↑ / k', 'Move up'],
    ['↓ / j', 'Move down'],
    ['← / h', 'Focus left panel'],
    ['→ / l', 'Focus right panel'],
    ['Tab', 'Cycle panel focus'],
    ['1-5', 'Jump to panel'],
    ['PgUp / PgDn', 'Page up / down'],
    ['Home / End', 'Scroll to top / bottom'],
    ['Enter / Space', 'Select / expand'],
  ]],
  ['Shortcuts', [
    ['Ctrl+P / :', 'Open command palette'],
    ['Ctrl+F / /', 'Open search'],
    ['Ctrl+R', 'Refresh all data'],
    ['?', 'Toggle this help'],
    ['q / Ctrl+C', 'Quit'],
    ['Esc', 'Close overlay / cancel input'],
  ]],
  ['Commands (via Ctrl+P)', [
    ['project list / create / delete', 'Project management'],
    ['plan tree / create-node', 'Plan operations'],
    ['dispatch <nodeId>', 'Dispatch task for execution'],
    ['cancel <execId>', 'Cancel execution'],
    ['steer <message>', 'Steer running task'],
    ['watch <execId>', 'Watch execution output'],
    ['env list / status', 'Machine management'],
    ['activity', 'Show activity feed'],
    ['refresh / r', 'Force refresh'],
    ['quit / q', 'Exit TUI'],
  ]],
  ['Terminal Compatibility', [
    ['tmux', 'Ctrl+B prefix is not captured — safe'],
    ['screen', 'Ctrl+A prefix is not captured — safe'],
    ['vscode', 'All bindings work in integrated terminal'],
  ]],
] as const

export function HelpOverlay() {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="yellow"> Keybindings Reference </Text>
      <Text> </Text>
      {KEYBINDINGS.map(([section, bindings]) => (
        <Box key={section as string} flexDirection="column" marginBottom={1}>
          <Text bold underline>{section as string}</Text>
          {(bindings as ReadonlyArray<readonly [string, string]>).map(([key, desc]) => (
            <Box key={key} gap={2}>
              <Text color="cyan">{(key as string).padEnd(34)}</Text>
              <Text>{desc as string}</Text>
            </Box>
          ))}
        </Box>
      ))}
      <Text dimColor>Press Esc or ? to close</Text>
    </Box>
  )
}
