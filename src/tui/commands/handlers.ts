/**
 * Command handler implementations. Delegate to AstroClient.
 */
import type { AstroClient } from '../../client.js'
import { useProjectsStore } from '../stores/projects-store.js'
import { usePlanStore } from '../stores/plan-store.js'
import { useMachinesStore } from '../stores/machines-store.js'
import { useTuiStore } from '../stores/tui-store.js'
import { useExecutionStore } from '../stores/execution-store.js'

export type CommandHandler = (args: string[], client: AstroClient) => Promise<void>

export interface PaletteCommand {
  name: string
  description: string
  usage?: string
}

/** Commands shown in the palette (user-facing, no aliases) */
export const PALETTE_COMMANDS: PaletteCommand[] = [
  { name: 'project list', description: 'List all projects' },
  { name: 'project show', description: 'Show project details', usage: 'project show <id>' },
  { name: 'project create', description: 'Create a new project', usage: 'project create <name>' },
  { name: 'project delete', description: 'Delete a project', usage: 'project delete <id>' },
  { name: 'plan tree', description: 'Show plan tree for selected project' },
  { name: 'plan create-node', description: 'Create a plan node', usage: 'plan create-node <title>' },
  { name: 'plan update-node', description: 'Update a plan node field', usage: 'plan update-node <id> <field> <value>' },
  { name: 'dispatch', description: 'Dispatch selected task for execution', usage: 'dispatch [nodeId]' },
  { name: 'cancel', description: 'Cancel running execution', usage: 'cancel [executionId]' },
  { name: 'steer', description: 'Send guidance to running task', usage: 'steer <message>' },
  { name: 'watch', description: 'Watch execution output', usage: 'watch <executionId>' },
  { name: 'env list', description: 'List machines/environments' },
  { name: 'env status', description: 'Show relay status' },
  { name: 'search', description: 'Search projects and tasks', usage: 'search <query>' },
  { name: 'activity', description: 'Show recent activity feed' },
  { name: 'playground', description: 'Start a playground (Cloud Code) session', usage: 'playground <description>' },
  { name: 'plan generate', description: 'Generate a plan using AI', usage: 'plan generate <description>' },
  { name: 'refresh', description: 'Refresh all data' },
  { name: 'help', description: 'Toggle keybinding reference' },
  { name: 'quit', description: 'Exit the TUI' },
]

export const handlers: Record<string, CommandHandler> = {
  // ── Quit ──
  q: async () => {
    process.exit(0)
  },
  quit: async () => {
    process.exit(0)
  },

  // ── Refresh ──
  r: async (_args, client) => {
    await refreshAll(client)
  },
  refresh: async (_args, client) => {
    await refreshAll(client)
  },

  // ── Project commands ──
  'project list': async (_args, client) => {
    const projects = await client.listProjects()
    useProjectsStore.getState().setProjects(projects)
  },

  'project show': async (args, client) => {
    const id = args[0]
    if (!id) return
    try {
      const project = await client.resolveProject(id)
      useTuiStore.getState().openDetail('project', project.id)
    } catch {
      useTuiStore.getState().setLastError(`Project not found: ${id}`)
    }
  },

  'project create': async (args, client) => {
    const name = args.join(' ')
    if (!name) {
      useTuiStore.getState().setLastError('Usage: :project create <name>')
      return
    }
    await client.createProject({ name })
    const projects = await client.listProjects()
    useProjectsStore.getState().setProjects(projects)
  },

  'project delete': async (args, client) => {
    const id = args[0]
    if (!id) return
    try {
      const project = await client.resolveProject(id)
      await client.deleteProject(project.id)
      const projects = await client.listProjects()
      useProjectsStore.getState().setProjects(projects)
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Plan commands ──
  'plan tree': async (_args, client) => {
    const projectId = useTuiStore.getState().selectedProjectId
    if (!projectId) {
      useTuiStore.getState().setLastError('No project selected')
      return
    }
    const { nodes, edges } = await client.getPlan(projectId)
    usePlanStore.getState().setPlan(projectId, nodes, edges)
    useTuiStore.getState().focusPanel('plan')
  },

  'plan create-node': async (args, client) => {
    const projectId = useTuiStore.getState().selectedProjectId
    if (!projectId) {
      useTuiStore.getState().setLastError('No project selected')
      return
    }
    const title = args.join(' ')
    if (!title) {
      useTuiStore.getState().setLastError('Usage: :plan create-node <title>')
      return
    }
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await client.createPlanNode({ id, projectId, title })
    const { nodes, edges } = await client.getPlan(projectId)
    usePlanStore.getState().setPlan(projectId, nodes, edges)
  },

  'plan update-node': async (args, client) => {
    const [nodeId, field, ...rest] = args
    if (!nodeId || !field) {
      useTuiStore.getState().setLastError('Usage: :plan update-node <nodeId> <field> <value>')
      return
    }
    const value = rest.join(' ')
    await client.updatePlanNode(nodeId, { [field]: value })
    const projectId = useTuiStore.getState().selectedProjectId
    if (projectId) {
      const { nodes, edges } = await client.getPlan(projectId)
      usePlanStore.getState().setPlan(projectId, nodes, edges)
    }
  },

  // ── Dispatch ──
  d: async (args, client) => {
    await handlers.dispatch(args, client)
  },
  dispatch: async (args, client) => {
    const nodeId = args[0] ?? useTuiStore.getState().selectedNodeId
    const projectId = useTuiStore.getState().selectedProjectId
    if (!nodeId || !projectId) {
      useTuiStore.getState().setLastError('No node/project selected for dispatch')
      return
    }

    try {
      // Send minimal payload — server resolves everything from DB
      const response = await client.dispatchTask({ nodeId, projectId })
      // Init execution tracking
      const execId = `exec-${Date.now()}`
      useExecutionStore.getState().initExecution(execId, nodeId)
      useExecutionStore.getState().setWatching(execId)
      useTuiStore.getState().focusPanel('output')

      // Stream response
      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as Record<string, unknown>
                const eventType = event.type as string
                if (eventType === 'text') {
                  useExecutionStore.getState().appendText(execId, (event.content ?? '') as string)
                } else if (eventType === 'tool_use') {
                  useExecutionStore.getState().appendToolCall(execId, (event.name ?? '') as string)
                } else if (eventType === 'result') {
                  useExecutionStore.getState().setStatus(execId, (event.status ?? 'completed') as string)
                } else if (eventType === 'error') {
                  useExecutionStore.getState().appendLine(execId, `[error] ${event.message}`)
                  useExecutionStore.getState().setStatus(execId, 'failure')
                }
              } catch {
                // Skip non-JSON
              }
            }
          }
        }
      }
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Cancel ──
  c: async (args, client) => {
    await handlers.cancel(args, client)
  },
  cancel: async (args, client) => {
    const executionId = args[0] ?? useExecutionStore.getState().watchingId
    if (!executionId) {
      useTuiStore.getState().setLastError('No execution to cancel')
      return
    }
    try {
      await client.cancelTask({ executionId })
      useExecutionStore.getState().setStatus(executionId, 'cancelled')
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Steer ──
  s: async (args, client) => {
    await handlers.steer(args, client)
  },
  steer: async (args, client) => {
    const message = args.join(' ')
    if (!message) {
      useTuiStore.getState().setLastError('Usage: :steer <message>')
      return
    }
    const executionId = useExecutionStore.getState().watchingId
    const selectedMachineId = useTuiStore.getState().selectedMachineId
    if (!executionId || !selectedMachineId) {
      useTuiStore.getState().setLastError('No active execution/machine to steer')
      return
    }
    try {
      await client.steerTask({ taskId: executionId, machineId: selectedMachineId, message })
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Watch ──
  watch: async (args) => {
    const executionId = args[0]
    if (!executionId) {
      useTuiStore.getState().setLastError('Usage: :watch <executionId>')
      return
    }
    useExecutionStore.getState().setWatching(executionId)
    useTuiStore.getState().focusPanel('output')
  },

  // ── Env ──
  'env list': async (_args, client) => {
    const machines = await client.listMachines()
    useMachinesStore.getState().setMachines(machines)
    useTuiStore.getState().focusPanel('machines')
  },

  'env status': async (_args, client) => {
    const status = await client.getRelayStatus()
    useTuiStore.getState().setLastError(JSON.stringify(status, null, 2))
  },

  // ── Search ──
  search: async (args, client) => {
    const query = args.join(' ')
    if (!query) return
    try {
      await client.search(query)
      useTuiStore.getState().toggleSearch()
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Activity ──
  activity: async (_args, client) => {
    const projectId = useTuiStore.getState().selectedProjectId
    try {
      const activities = await client.listActivities(projectId ? { projectId } : undefined)
      // Show activities in output panel
      for (const a of activities.slice(0, 20)) {
        useExecutionStore.getState().appendLine('activity', `[${a.type}] ${a.title}`)
      }
      useExecutionStore.getState().setWatching('activity')
      useTuiStore.getState().focusPanel('output')
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Playground ──
  playground: async (args, client) => {
    const description = args.join(' ')
    if (!description) {
      useTuiStore.getState().setLastError('Usage: playground <description>')
      return
    }
    const projectId = useTuiStore.getState().selectedProjectId
    if (!projectId) {
      useTuiStore.getState().setLastError('No project selected. Select a project first.')
      return
    }

    const nodeId = `playground-${projectId}-${Date.now()}`

    try {
      const response = await client.dispatchTask({
        nodeId,
        projectId,
        skipSafetyCheck: true,
        description,
        title: `Playground: ${description.slice(0, 50)}`,
      })

      useExecutionStore.getState().initExecution(nodeId, nodeId)
      useExecutionStore.getState().setWatching(nodeId)
      useTuiStore.getState().setActiveView('playground')

      await streamExecution(nodeId, response)
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Plan Generate ──
  'plan generate': async (args, client) => {
    const description = args.join(' ')
    if (!description) {
      useTuiStore.getState().setLastError('Usage: plan generate <description>')
      return
    }
    const projectId = useTuiStore.getState().selectedProjectId
    if (!projectId) {
      useTuiStore.getState().setLastError('No project selected. Select a project first.')
      return
    }

    const nodeId = `plan-${projectId}`

    try {
      const response = await client.dispatchTask({
        nodeId,
        projectId,
        isInteractivePlan: true,
        description,
      })

      useExecutionStore.getState().initExecution(nodeId, nodeId)
      useExecutionStore.getState().setWatching(nodeId)
      useTuiStore.getState().setActiveView('plan-gen')

      await streamExecution(nodeId, response)

      // After plan generation completes, refresh plan and go back to dashboard
      useExecutionStore.getState().appendLine(nodeId, '[plan] Refreshing plan...')
      const { nodes, edges } = await client.getPlan(projectId)
      usePlanStore.getState().setPlan(projectId, nodes, edges)
      useTuiStore.getState().setActiveView('dashboard')
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Help ──
  help: async () => {
    useTuiStore.getState().toggleHelp()
  },
  '?': async () => {
    useTuiStore.getState().toggleHelp()
  },
}

/**
 * Stream SSE response from a dispatch into the execution store output panel.
 * Parses each SSE line and routes text/tool/file events to the execution store.
 */
async function streamExecution(executionId: string, response: Response): Promise<void> {
  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6)) as Record<string, unknown>
        const eventType = event.type as string
        if (eventType === 'text') {
          useExecutionStore.getState().appendText(executionId, (event.content ?? '') as string)
        } else if (eventType === 'tool_use') {
          useExecutionStore.getState().appendToolCall(executionId, (event.name ?? '') as string)
        } else if (eventType === 'file_change') {
          useExecutionStore.getState().appendFileChange(
            executionId,
            (event.path ?? '') as string,
            (event.action ?? 'modified') as string,
            event.linesAdded as number | undefined,
            event.linesRemoved as number | undefined,
          )
        } else if (eventType === 'result' || eventType === 'done') {
          useExecutionStore.getState().setStatus(executionId, (event.status ?? 'completed') as string)
        } else if (eventType === 'error') {
          useExecutionStore.getState().appendLine(executionId, `[error] ${event.message}`)
          useExecutionStore.getState().setStatus(executionId, 'failure')
        } else if (eventType === 'plan_result') {
          useExecutionStore.getState().appendLine(executionId, '[plan] Plan generated successfully')
        } else if (eventType === 'approval_request') {
          useExecutionStore.getState().setPendingApproval({
            requestId: event.requestId as string,
            question: event.question as string,
            options: event.options as string[],
            machineId: event.machineId as string | undefined,
            taskId: event.taskId as string | undefined,
          })
        }
      } catch {
        // Skip non-JSON
      }
    }
  }
}

async function refreshAll(client: AstroClient) {
  try {
    const [projects, machines] = await Promise.all([
      client.listProjects(),
      client.listMachines(),
    ])
    useProjectsStore.getState().setProjects(projects)
    useMachinesStore.getState().setMachines(machines)
    useTuiStore.getState().setMachineCount(machines.filter((m) => m.isConnected).length)

    const projectId = useTuiStore.getState().selectedProjectId
    if (projectId) {
      const { nodes, edges } = await client.getPlan(projectId)
      usePlanStore.getState().setPlan(projectId, nodes, edges)
    }
  } catch (err) {
    useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
  }
}
