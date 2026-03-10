import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useTuiStore } from '../../stores/tui-store.js'
import { useExecutionStore } from '../../stores/execution-store.js'
import { getClient } from '../../../client.js'

export function ApprovalOverlay() {
  const showApproval = useTuiStore((s) => s.showApproval)
  const activeApprovalId = useTuiStore((s) => s.activeApprovalId)
  const pendingApprovals = useTuiStore((s) => s.pendingApprovals)
  const selectedIndex = useTuiStore((s) => s.approvalSelectedIndex)
  const { setApprovalSelectedIndex, removePendingApproval, hideApprovalOverlay, setLastError } = useTuiStore()

  const [confirmingReject, setConfirmingReject] = React.useState(false)

  const approval = activeApprovalId ? pendingApprovals.get(activeApprovalId) : null

  // Reset confirmation state when approval changes
  React.useEffect(() => {
    setConfirmingReject(false)
  }, [activeApprovalId])

  useInput((input, key) => {
    if (!showApproval || !approval) return

    if (key.escape) {
      if (confirmingReject) {
        setConfirmingReject(false)
        return
      }
      hideApprovalOverlay()
      return
    }

    // In rejection confirmation mode
    if (confirmingReject) {
      if (input === 'y' || key.return) {
        setConfirmingReject(false)
        const reqId = approval.requestId
        const nodeTitle = approval.question.slice(0, 60)
        getClient().sendApproval({
          taskId: approval.taskId,
          machineId: approval.machineId ?? '',
          requestId: reqId,
          answered: false,
          message: `Rejected by user via TUI: ${nodeTitle}`,
        }).then(() => {
          removePendingApproval(reqId)
          if (useExecutionStore.getState().pendingApproval?.requestId === reqId) {
            useExecutionStore.getState().setPendingApproval(null)
          }
        }).catch((err: unknown) => {
          setLastError(err instanceof Error ? err.message : String(err))
        })
      } else if (input === 'n') {
        setConfirmingReject(false)
      }
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
        if (useExecutionStore.getState().pendingApproval?.requestId === reqId) {
          useExecutionStore.getState().setPendingApproval(null)
        }
      }).catch((err: unknown) => {
        setLastError(err instanceof Error ? err.message : String(err))
      })
      return
    }

    // 'r' to reject — requires confirmation
    if (input === 'r' && !key.ctrl) {
      setConfirmingReject(true)
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
        {confirmingReject ? (
          <Text bold color="red">Reject this approval? y/n</Text>
        ) : (
          <Text dimColor>Enter: approve | r: reject | Esc: dismiss</Text>
        )}
      </Box>
    </Box>
  )
}
