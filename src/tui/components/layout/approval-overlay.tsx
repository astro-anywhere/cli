import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useTuiStore } from '../../stores/tui-store.js'
import { getClient } from '../../../client.js'

export function ApprovalOverlay() {
  const showApproval = useTuiStore((s) => s.showApproval)
  const activeApprovalId = useTuiStore((s) => s.activeApprovalId)
  const pendingApprovals = useTuiStore((s) => s.pendingApprovals)
  const selectedIndex = useTuiStore((s) => s.approvalSelectedIndex)
  const { setApprovalSelectedIndex, removePendingApproval, hideApprovalOverlay, setLastError } = useTuiStore()

  const approval = activeApprovalId ? pendingApprovals.get(activeApprovalId) : null

  useInput((input, key) => {
    if (!showApproval || !approval) return

    if (key.escape) {
      hideApprovalOverlay()
      return
    }

    if (key.upArrow) {
      setApprovalSelectedIndex(Math.max(0, selectedIndex - 1))
      return
    }

    if (key.downArrow) {
      setApprovalSelectedIndex(Math.min((approval.options.length || 1) - 1, selectedIndex + 1))
      return
    }

    if (key.return) {
      const answer = approval.options[selectedIndex] ?? approval.options[0] ?? 'yes'
      const reqId = approval.requestId
      getClient().sendApproval({
        taskId: approval.taskId,
        machineId: approval.machineId ?? '',
        requestId: reqId,
        answered: true,
        answer,
      }).then(() => {
        removePendingApproval(reqId)
      }).catch((err: unknown) => {
        setLastError(err instanceof Error ? err.message : String(err))
      })
      return
    }

    // 'r' to reject
    if (input === 'r' && !key.ctrl) {
      const reqId = approval.requestId
      getClient().sendApproval({
        taskId: approval.taskId,
        machineId: approval.machineId ?? '',
        requestId: reqId,
        answered: false,
        message: 'Rejected from TUI',
      }).then(() => {
        removePendingApproval(reqId)
      }).catch((err: unknown) => {
        setLastError(err instanceof Error ? err.message : String(err))
      })
      return
    }
  }, { isActive: showApproval })

  if (!showApproval || !approval) return null

  const options = approval.options.length > 0 ? approval.options : ['approve']

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      paddingY={0}
      width="60%"
      height={Math.min(options.length + 6, 15)}
    >
      <Box>
        <Text bold color="yellow">Approval Required </Text>
        <Text dimColor>({pendingApprovals.size} pending)</Text>
      </Box>
      <Box marginTop={1}>
        <Text wrap="wrap">{approval.question}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Box key={opt}>
            <Text
              inverse={i === selectedIndex}
              bold={i === selectedIndex}
              color={i === selectedIndex ? 'yellow' : undefined}
            >
              {i === selectedIndex ? ' \u25B6 ' : '   '}{opt}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter: approve | r: reject | Esc: dismiss</Text>
      </Box>
    </Box>
  )
}
