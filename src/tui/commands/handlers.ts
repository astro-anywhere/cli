/**
 * Command handler implementations. Delegate to AstroClient.
 */
import type { AstroClient } from '../../client.js'
import { useProjectsStore } from '../stores/projects-store.js'
import { usePlanStore } from '../stores/plan-store.js'
import { useMachinesStore } from '../stores/machines-store.js'
import { useTuiStore } from '../stores/tui-store.js'
import { useExecutionStore } from '../stores/execution-store.js'
import { useChatStore } from '../stores/chat-store.js'
import { useSessionSettingsStore } from '../stores/session-settings-store.js'
import { readSSEStream } from '../../client.js'

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
  { name: 'project chat', description: 'Chat with AI about the selected project', usage: 'project chat <message>' },
  { name: 'task chat', description: 'Chat with AI about the selected task', usage: 'task chat <message>' },
  { name: 'summarize', description: 'AI-generated summary of an execution', usage: 'summarize [executionId]' },
  { name: 'approve', description: 'Approve pending approval request', usage: 'approve [requestId] [option]' },
  { name: 'reject', description: 'Reject pending approval request', usage: 'reject [requestId] [message]' },
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

    // Find a connected machine
    const machines = useMachinesStore.getState().machines
    const connectedMachine = machines.find((m) => m.isConnected)
    if (!connectedMachine) {
      useTuiStore.getState().setLastError('No connected machines. Start an agent runner first.')
      return
    }

    const execId = `exec-${Date.now()}`
    const planNode = usePlanStore.getState().nodes.find((n) => n.id === nodeId)
    const title = planNode?.title ?? nodeId

    useExecutionStore.getState().initExecution(execId, nodeId, title)
    useExecutionStore.getState().setWatching(execId)
    useTuiStore.getState().focusPanel('output')
    useExecutionStore.getState().appendLine(execId, `[progress] Dispatching task...`)

    try {
      // POST /api/dispatch/task returns an SSE stream
      const response = await client.dispatchTask({
        nodeId,
        projectId,
        targetMachineId: connectedMachine.id,
      })

      await streamSSEToExecution(response, execId, client, projectId)
    } catch (err) {
      useExecutionStore.getState().setStatus(execId, 'error')
      useExecutionStore.getState().appendLine(execId, `[error] ${err instanceof Error ? err.message : String(err)}`)
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
  // Matches frontend: creates a new playground project, then dispatches.
  // No project selection required — uses session settings for machine + workdir.
  playground: async (args, client) => {
    const description = args.join(' ')
    if (!description) {
      useTuiStore.getState().setLastError('Usage: playground <description>')
      return
    }

    // Use session settings (user-configurable machine + working directory)
    const settings = useSessionSettingsStore.getState()

    // Auto-initialize machine if not set yet
    if (!settings.machineId) {
      const machines = useMachinesStore.getState().machines
      const localPlatform = process.platform
      const m =
        machines.find((m) => m.isConnected && m.platform === localPlatform) ??
        machines.find((m) => m.isConnected)
      if (m) {
        settings.init(m.id, m.name, settings.workingDirectory || process.cwd())
      }
    }

    const targetMachineId = settings.machineId
    const targetMachineName = settings.machineName
    const workDir = settings.workingDirectory || process.cwd()

    if (!targetMachineId) {
      useTuiStore.getState().setLastError('No connected machines. Start an agent runner first.')
      return
    }

    const execId = `playground-${Date.now()}`
    const title = `Playground: ${description.slice(0, 50)}`

    // Show immediate feedback
    useExecutionStore.getState().initExecution(execId, execId, title)
    useExecutionStore.getState().setWatching(execId)
    useTuiStore.getState().setActiveView('playground')
    useExecutionStore.getState().appendLine(execId, `> ${description}`)
    useExecutionStore.getState().appendLine(execId, `[progress] Creating playground session...`)

    try {
      // 1. Create a playground project (matches frontend startPlaygroundSession)
      const projectId = crypto.randomUUID()
      const project = await client.createProject({
        id: projectId,
        name: description.slice(0, 60) || 'Playground Session',
        description,
        workingDirectory: workDir,
        defaultMachineId: targetMachineId,
        projectType: 'playground',
      })

      const nodeId = `playground-${project.id}`

      useExecutionStore.getState().appendLine(execId, `[progress] Dispatching to ${targetMachineName ?? targetMachineId} (${workDir})...`)

      // 2. Dispatch the task
      const response = await client.dispatchTask({
        nodeId,
        projectId: project.id,
        title,
        description,
        targetMachineId,
        workingDirectory: workDir,
        deliveryMode: 'direct',
        skipSafetyCheck: true,
        force: true,
      })

      // 3. Process SSE stream
      await streamSSEToExecution(response, execId, client, project.id)
    } catch (err) {
      useExecutionStore.getState().setStatus(execId, 'error')
      useExecutionStore.getState().appendLine(execId, `[error] ${err instanceof Error ? err.message : String(err)}`)
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Plan Generate (uses /api/dispatch/task SSE with isInteractivePlan) ──
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

    // Find a connected machine (required for dispatch routing)
    const machines = useMachinesStore.getState().machines
    const connectedMachine = machines.find((m) => m.isConnected)
    if (!connectedMachine) {
      useTuiStore.getState().setLastError('No connected machines. Start an agent runner first.')
      return
    }

    const nodeId = `plan-${projectId}`
    const execId = `plan-${projectId}-${Date.now()}`
    const title = `Plan: ${description.slice(0, 50)}`

    useExecutionStore.getState().initExecution(execId, nodeId, title)
    useExecutionStore.getState().setWatching(execId)
    useTuiStore.getState().setActiveView('plan-gen')
    useExecutionStore.getState().appendLine(execId, `[progress] Plan generation started`)

    try {
      // POST /api/dispatch/task returns an SSE stream
      const response = await client.dispatchTask({
        nodeId,
        projectId,
        title: `Interactive planning: ${description.slice(0, 80)}`,
        description,
        targetMachineId: connectedMachine.id,
        isInteractivePlan: true,
        verification: 'human',
      })

      await streamSSEToExecution(response, execId, client, projectId)
    } catch (err) {
      useExecutionStore.getState().setStatus(execId, 'error')
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Project Chat (uses /api/agent/project-chat SSE) ──
  'project chat': async (args, client) => {
    const message = args.join(' ')
    if (!message) {
      useTuiStore.getState().setLastError('Usage: project chat <message>')
      return
    }
    const projectId = useTuiStore.getState().selectedProjectId
    if (!projectId) {
      useTuiStore.getState().setLastError('No project selected')
      return
    }

    const execId = `chat-project-${projectId}-${Date.now()}`
    const title = `Chat: ${message.slice(0, 50)}`
    const sessionId = useChatStore.getState().sessionId
    const messages = useChatStore.getState().messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    useExecutionStore.getState().initExecution(execId, `chat-${projectId}`, title)
    useExecutionStore.getState().setWatching(execId)
    useExecutionStore.getState().appendLine(execId, `> ${message}`)
    useChatStore.getState().addMessage('user', message)

    try {
      useChatStore.getState().setStreaming(true)
      useChatStore.getState().setContext(projectId)

      const { nodes, edges } = await client.getPlan(projectId)

      const response = await client.projectChat({
        message,
        sessionId: sessionId ?? undefined,
        projectId,
        planNodes: nodes,
        planEdges: edges,
        messages,
      })

      await streamSSEToExecution(response, execId, client, projectId)
      useChatStore.getState().flushStream()
      useChatStore.getState().setStreaming(false)
    } catch (err) {
      useChatStore.getState().setStreaming(false)
      useExecutionStore.getState().setStatus(execId, 'error')
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Task Chat (uses /api/agent/task-chat SSE) ──
  'task chat': async (args, client) => {
    const message = args.join(' ')
    if (!message) {
      useTuiStore.getState().setLastError('Usage: task chat <message>')
      return
    }
    const projectId = useTuiStore.getState().selectedProjectId
    const nodeId = useTuiStore.getState().selectedNodeId
    if (!projectId || !nodeId) {
      useTuiStore.getState().setLastError('No project/task selected')
      return
    }

    const planNode = usePlanStore.getState().nodes.find((n) => n.id === nodeId)
    const taskTitle = planNode?.title ?? nodeId
    const execId = `chat-task-${nodeId}-${Date.now()}`
    const title = `Task Chat: ${taskTitle.slice(0, 40)}`
    const sessionId = useChatStore.getState().sessionId
    const messages = useChatStore.getState().messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    useExecutionStore.getState().initExecution(execId, `chat-${nodeId}`, title)
    useExecutionStore.getState().setWatching(execId)
    useExecutionStore.getState().appendLine(execId, `> ${message}`)
    useChatStore.getState().addMessage('user', message)

    try {
      useChatStore.getState().setStreaming(true)
      useChatStore.getState().setContext(projectId, nodeId)

      const response = await client.taskChat({
        message,
        sessionId: sessionId ?? undefined,
        nodeId,
        projectId,
        taskTitle,
        taskDescription: planNode?.description,
        taskOutput: planNode?.executionOutput ?? undefined,
        branchName: planNode?.branchName ?? undefined,
        prUrl: planNode?.prUrl ?? undefined,
        messages,
      })

      await streamSSEToExecution(response, execId, client, projectId)
      useChatStore.getState().flushStream()
      useChatStore.getState().setStreaming(false)
    } catch (err) {
      useChatStore.getState().setStreaming(false)
      useExecutionStore.getState().setStatus(execId, 'error')
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Summarize ──
  summarize: async (args, client) => {
    const executionId = args[0] ?? useExecutionStore.getState().watchingId
    if (!executionId) {
      useTuiStore.getState().setLastError('Usage: summarize [executionId]')
      return
    }
    try {
      const result = await client.summarize({ executionId })
      useExecutionStore.getState().appendLine(executionId, `\n--- Summary ---\n${result.summary}`)
    } catch (err) {
      useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  // ── Resume ──
  resume: async (args) => {
    // Called as "resume:<executionId>" from palette or "resume <executionId>"
    const execId = args[0]
    if (!execId) {
      useTuiStore.getState().setLastError('Usage: resume <executionId>')
      return
    }
    const exec = useExecutionStore.getState().outputs.get(execId)
    if (!exec) {
      useTuiStore.getState().setLastError(`Session not found: ${execId}`)
      return
    }
    useExecutionStore.getState().setWatching(execId)
    // Switch to the appropriate view based on nodeId prefix
    if (exec.nodeId.startsWith('playground-')) {
      useTuiStore.getState().setActiveView('playground')
    } else if (exec.nodeId.startsWith('plan-')) {
      useTuiStore.getState().setActiveView('plan-gen')
    } else {
      useTuiStore.getState().setActiveView('active')
    }
  },

  // ── Approval ──
  approve: async (args, client) => {
    const tuiState = useTuiStore.getState()
    const requestId = args[0] ?? tuiState.activeApprovalId
    if (!requestId) {
      tuiState.setLastError('No pending approval to approve')
      return
    }
    const approval = tuiState.pendingApprovals.get(requestId)
    if (!approval) {
      tuiState.setLastError(`Approval not found: ${requestId}`)
      return
    }
    const answer = args[1] ?? approval.options[0] ?? 'yes'
    try {
      await client.sendApproval({
        taskId: approval.taskId,
        machineId: approval.machineId ?? '',
        requestId: approval.requestId,
        answered: true,
        answer,
      })
      tuiState.removePendingApproval(requestId)
      tuiState.hideApprovalOverlay()
      if (useExecutionStore.getState().pendingApproval?.requestId === requestId) {
        useExecutionStore.getState().setPendingApproval(null)
      }
    } catch (err) {
      tuiState.setLastError(err instanceof Error ? err.message : String(err))
    }
  },

  reject: async (args, client) => {
    const tuiState = useTuiStore.getState()
    const requestId = args[0] ?? tuiState.activeApprovalId
    if (!requestId) {
      tuiState.setLastError('No pending approval to reject')
      return
    }
    const approval = tuiState.pendingApprovals.get(requestId)
    if (!approval) {
      tuiState.setLastError(`Approval not found: ${requestId}`)
      return
    }
    const message = args.slice(1).join(' ') || 'Rejected from TUI'
    try {
      await client.sendApproval({
        taskId: approval.taskId,
        machineId: approval.machineId ?? '',
        requestId: approval.requestId,
        answered: false,
        message,
      })
      tuiState.removePendingApproval(requestId)
      tuiState.hideApprovalOverlay()
      if (useExecutionStore.getState().pendingApproval?.requestId === requestId) {
        useExecutionStore.getState().setPendingApproval(null)
      }
    } catch (err) {
      tuiState.setLastError(err instanceof Error ? err.message : String(err))
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
 * Stream SSE response into an execution store entry.
 * Handles text, tool_use, file_change, session_init, plan_result, done, error events.
 */
async function streamSSEToExecution(response: Response, execId: string, client: AstroClient, projectId?: string) {
  if (!response.body) {
    useExecutionStore.getState().setStatus(execId, 'completed')
    return
  }

  await readSSEStream(response, async (event) => {
    const type = event.type as string

    switch (type) {
      case 'init':
        // Server assigns the real execution ID
        if (event.executionId) {
          useExecutionStore.getState().appendLine(execId, `[progress] Execution started (${event.executionId})`)
        }
        break
      case 'text': {
        const content = (event.content ?? event.text ?? '') as string
        if (content) {
          useExecutionStore.getState().appendText(execId, content)
          useChatStore.getState().appendStream(content)
        }
        break
      }
      case 'tool_use':
        useExecutionStore.getState().appendToolCall(execId, (event.toolName ?? event.name) as string)
        break
      case 'tool_result':
        break
      case 'file_change':
        useExecutionStore.getState().appendFileChange(
          execId,
          event.path as string,
          event.action as string,
          event.linesAdded as number | undefined,
          event.linesRemoved as number | undefined,
        )
        break
      case 'progress':
        useExecutionStore.getState().appendLine(execId, `[progress] ${event.message as string}`)
        break
      case 'session_init':
        if (event.sessionId) {
          useChatStore.getState().setSessionId(event.sessionId as string)
        }
        break
      case 'plan_result':
        useExecutionStore.getState().appendLine(execId, '[plan] Plan generated — refreshing...')
        if (projectId) {
          setTimeout(async () => {
            try {
              const { nodes, edges } = await client.getPlan(projectId)
              usePlanStore.getState().setPlan(projectId, nodes, edges)
            } catch { /* ignore */ }
          }, 500)
        }
        break
      case 'result':
        // Execution completed — the result event carries status and output
        useExecutionStore.getState().setStatus(execId, (event.status === 'success') ? 'completed' : 'error')
        if (event.error) {
          useExecutionStore.getState().appendLine(execId, `[error] ${event.error as string}`)
        }
        break
      case 'approval_request':
        useExecutionStore.getState().setPendingApproval({
          requestId: event.requestId as string,
          question: event.question as string,
          options: event.options as string[],
          machineId: event.machineId as string | undefined,
          taskId: event.taskId as string | undefined,
        })
        break
      case 'done':
        useExecutionStore.getState().setStatus(execId, 'completed')
        break
      case 'error': {
        const msg = (event.error ?? event.message ?? 'Unknown error') as string
        useExecutionStore.getState().appendLine(execId, `[error] ${msg}`)
        useExecutionStore.getState().setStatus(execId, 'error')
        break
      }
      case 'heartbeat':
      case 'compaction':
      case 'aborted':
        break
    }
  })

  // If status wasn't set by a done/error event, mark as completed
  const exec = useExecutionStore.getState().outputs.get(execId)
  if (exec?.status === 'running') {
    useExecutionStore.getState().setStatus(execId, 'completed')
  }
}

async function refreshAll(client: AstroClient) {
  try {
    const [projects, machines, fullPlan] = await Promise.all([
      client.listProjects(),
      client.listMachines(),
      client.getFullPlan(),
    ])
    useProjectsStore.getState().setProjects(projects)
    useMachinesStore.getState().setMachines(machines)
    useTuiStore.getState().setMachineCount(machines.filter((m) => m.isConnected).length)
    usePlanStore.getState().setAllPlans(fullPlan.nodes, fullPlan.edges)
  } catch (err) {
    useTuiStore.getState().setLastError(err instanceof Error ? err.message : String(err))
  }
}
