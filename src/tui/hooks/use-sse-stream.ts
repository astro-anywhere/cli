/**
 * Hook to manage SSE connection lifecycle.
 * Dispatches events to Zustand stores.
 */
import { useEffect, useRef } from 'react'
import { SSEClient, type SSEEvent } from '../sse-client.js'
import { getClient, type AstroClient, type Machine } from '../../client.js'
import { useTuiStore } from '../stores/tui-store.js'
import { useMachinesStore } from '../stores/machines-store.js'
import { useExecutionStore } from '../stores/execution-store.js'
import { usePlanStore } from '../stores/plan-store.js'

export function useSSEStream(client: AstroClient, onReconnect?: () => void) {
  const sseRef = useRef<SSEClient | null>(null)

  const setConnected = useTuiStore((s) => s.setConnected)
  const setMachineCount = useTuiStore((s) => s.setMachineCount)
  const setLastError = useTuiStore((s) => s.setLastError)

  useEffect(() => {
    const handler = (event: SSEEvent) => {
      switch (event.type) {
        case '__connected':
          setConnected(true)
          setLastError(null)
          // Refresh data on reconnect — picks up changes made from browser
          onReconnect?.()
          break

        case '__disconnected':
          setConnected(false)
          setLastError(event.data.error as string)
          break

        case '__reconnecting':
          setConnected(false)
          break

        case 'machines:snapshot': {
          const machines = (event.data as unknown as Machine[]) ?? []
          useMachinesStore.getState().setMachines(machines)
          setMachineCount(machines.filter((m) => m.isConnected).length)
          break
        }

        case 'machine:connected': {
          const machine = event.data as unknown as Machine
          useMachinesStore.getState().addMachine(machine)
          setMachineCount(useMachinesStore.getState().machines.filter((m) => m.isConnected).length)
          break
        }

        case 'machine:disconnected': {
          const id = event.data.machineId as string
          useMachinesStore.getState().updateMachine(id, { isConnected: false } as Partial<Machine>)
          setMachineCount(useMachinesStore.getState().machines.filter((m) => m.isConnected).length)
          break
        }

        case 'task:stdout':
        case 'task:text': {
          const taskId = event.data.taskId as string
          const text = (event.data.data ?? event.data.output ?? '') as string
          if (typeof text === 'string' && text.length > 0) {
            useExecutionStore.getState().appendText(taskId, text)
          }
          break
        }

        case 'task:progress': {
          const taskId = event.data.taskId as string
          const message = event.data.message as string
          if (!message) break
          // Filter out noisy "Using tool:*" progress — already tracked via tool_trace
          if (/^Using tool:/i.test(message)) break
          useExecutionStore.getState().appendLine(taskId, `[progress] ${message}`)
          break
        }

        case 'task:result': {
          const taskId = event.data.taskId as string
          const status = event.data.status as string
          useExecutionStore.getState().setStatus(taskId, status)
          // Plan-node status now handled by node:status_changed SSE event
          break
        }

        case 'task:tool_trace': {
          const taskId = event.data.taskId as string
          const toolName = event.data.toolName as string
          // Collapsed into dot-trail instead of one line per call
          useExecutionStore.getState().appendToolCall(taskId, toolName)
          break
        }

        case 'task:file_change': {
          const taskId = event.data.taskId as string
          const path = event.data.path as string
          const action = event.data.action as string
          const added = event.data.linesAdded as number | undefined
          const removed = event.data.linesRemoved as number | undefined
          useExecutionStore.getState().appendFileChange(taskId, path, action, added, removed)
          break
        }

        case 'task:session_init': {
          const taskId = event.data.taskId as string
          const nodeId = (event.data.nodeId ?? taskId) as string
          const title = (event.data.title as string | undefined) ?? nodeId
          useExecutionStore.getState().initExecution(taskId, nodeId, title)
          useExecutionStore.getState().setWatching(taskId)
          break
        }

        case 'task:plan_result': {
          const taskId = event.data.taskId as string
          useExecutionStore.getState().appendLine(taskId, '[plan] Plan generated — refreshing...')
          // Auto-refresh plan data
          const projectId = (event.data.projectId ?? useTuiStore.getState().selectedProjectId) as string | null
          if (projectId) {
            // Defer refresh to avoid blocking SSE handler
            setTimeout(async () => {
              try {
                const { nodes, edges } = await client.getPlan(projectId)
                usePlanStore.getState().setPlan(projectId, nodes, edges)
              } catch { /* ignore */ }
            }, 500)
          }
          break
        }

        case 'task:approval_request': {
          const taskId = event.data.taskId as string
          const requestId = event.data.requestId as string
          const question = event.data.question as string
          const options = (event.data.options ?? []) as string[]
          const machineId = event.data.machineId as string | undefined
          // Route to execution store (for inline ApprovalDialog)
          useExecutionStore.getState().setPendingApproval({
            requestId, question, options, machineId, taskId,
          })
          // Also route to tui store (for queued overlay + :approve/:reject commands)
          if (requestId && question) {
            useTuiStore.getState().addPendingApproval({ taskId, requestId, question, options, machineId })
          }
          break
        }

        case 'task:approval_auto_responded': {
          const requestId = event.data.requestId as string
          if (requestId) {
            useTuiStore.getState().removePendingApproval(requestId)
            useExecutionStore.getState().setPendingApproval(null)
          }
          break
        }

        case 'node:status_changed': {
          const nodeId = event.data.nodeId as string
          const projectId = event.data.projectId as string
          const planState = usePlanStore.getState()
          // Skip events for other projects
          if (planState.projectId && projectId && planState.projectId !== projectId) break
          if (!nodeId) break
          const gen = planState.bumpNodeStatusGen(nodeId)
          // Fetch fresh node from DB
          getClient().getNode(nodeId).then((freshNode) => {
            if (freshNode && planState.getNodeStatusGen(nodeId) === gen) {
              usePlanStore.getState().mergeNode(freshNode)
            }
          }).catch(() => {
            // Fallback: update status from event payload
            const status = event.data.status as string
            if (status && planState.getNodeStatusGen(nodeId) === gen) {
              usePlanStore.getState().updateNodeStatus(nodeId, status)
            }
          })
          break
        }

        case 'task:init': {
          const execId = event.data.executionId as string
          const nodeId = event.data.nodeId as string
          const title = (event.data.title as string | undefined) ?? nodeId
          if (execId) {
            useExecutionStore.getState().initExecution(execId, nodeId ?? execId, title)
            useExecutionStore.getState().setWatching(execId)
          }
          break
        }

        case 'heartbeat':
          // Keep-alive, no action needed
          break
      }
    }

    const sse = new SSEClient(client, handler)
    sseRef.current = sse
    sse.start().catch(() => {
      // Connection failed, will retry
    })

    return () => {
      sse.stop()
    }
  }, [client, setConnected, setMachineCount, setLastError])
}
