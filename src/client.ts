import { getServerUrl, loadConfig, saveConfig } from './config.js'

// ── Types (match server JSON responses) ─────────────────────────────

export interface Project {
  id: string
  name: string
  description: string
  visionDoc: string
  status: string
  workingDirectory: string | null
  repository: string | null
  deliveryMode: string | null
  projectType: string | null
  health: string | null
  progress: number
  startDate: string | null
  targetDate: string | null
  lead: string | null
  defaultEnvironment: string | null
  defaultMachineId: string | null
  labels: Array<{ id: string; name: string; color: string }>
  color: string
  icon: string
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface PlanNode {
  id: string        // This is the clientId from the DB
  projectId: string
  type: string
  title: string
  description: string
  status: string
  parentId: string | null
  dependencies: string[]
  position: { x: number; y: number }
  startDate: string | null
  endDate: string | null
  dueDate: string | null
  priority: string | null
  estimate: string | null
  executionId: string | null
  executionOutput: string | null
  executionError: string | null
  executionStartedAt: string | null
  executionCompletedAt: string | null
  branchName: string | null
  prUrl: string | null
  prNumber: number | null
  mergeQueueStatus: string | null
  autoPr: boolean | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface PlanEdge {
  id: string        // This is the clientId from the DB
  source: string    // sourceClientId
  target: string    // targetClientId
  type: string
  [key: string]: unknown
}

export interface Execution {
  executionId: string
  nodeId?: string
  nodeClientId?: string
  projectId: string
  status: string
  streamText?: string
  error: string | null
  machineId: string | null
  providerId: string | null
  providerName: string | null
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  tokensUsed: number | null
  estimatedCostUsd: number | null
  model: string | null
  turnsUsed: number | null
  markdownSummary: string | null
  [key: string]: unknown
}

export interface ToolTrace {
  id: string
  executionId: string
  toolName: string
  toolInput: unknown
  toolResult: unknown
  success: boolean | null
  duration: number | null
  timestamp: string
}

export interface FileChange {
  id: string
  executionId: string
  path: string
  action: string
  linesAdded: number | null
  linesRemoved: number | null
  timestamp: string
}

export interface Machine {
  id: string
  name: string
  hostname: string
  platform: string
  environmentType: string
  providers: string[]
  providerConfigs?: Array<{
    provider: string
    enabled: boolean
    defaultModel?: string
    settings?: Record<string, unknown>
  }>
  isConnected: boolean
  isRevoked: boolean
  workspaceId: string | null
  metadata: Record<string, string> | null
  registeredAt: string
  lastSeenAt: string
  [key: string]: unknown
}

export interface ActivityEvent {
  id: string
  userId: string
  projectId: string
  type: string
  title: string
  description: string | null
  nodeId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface ObservationEvent {
  id: string
  traceId: string
  parentObservationId: string | null
  type: string
  name: string
  startTime: string
  endTime: string | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsd: number | null
  level: string
  metadata: unknown
  [key: string]: unknown
}

export interface ObservationStats {
  totalEvents: number
  totalSpans: number
  totalGenerations: number
  totalTools: number
  errorCount: number
  warningCount: number
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  [key: string]: unknown
}

export interface SearchResults {
  projects: Project[]
  tasks: Array<PlanNode & { projectName?: string }>
  executions: Execution[]
}

// ── API Client ──────────────────────────────────────────────────────

export class AstroClient {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(opts?: { serverUrl?: string }) {
    this.baseUrl = getServerUrl(opts?.serverUrl)
    const config = loadConfig()
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    const config = loadConfig()
    if (!config.refreshToken) return false

    try {
      const url = new URL('/api/device/refresh', this.baseUrl)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: config.refreshToken, grantType: 'refresh_token' }),
      })
      if (!res.ok) return false

      const data = await res.json() as { accessToken: string; refreshToken?: string }
      saveConfig({
        authToken: data.accessToken,
        ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
      })
      this.headers['Authorization'] = `Bearer ${data.accessToken}`
      return true
    } catch (err) {
      console.error(`Token refresh failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }

  private async request<T>(method: string, path: string, body?: unknown, params?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(path, this.baseUrl)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v)
      }
    }
    let res = await fetch(url.toString(), {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    // Auto-refresh on 401 and retry once
    if (res.status === 401) {
      const refreshed = await this.refreshAccessToken()
      if (refreshed) {
        res = await fetch(url.toString(), {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
        })
      }
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`API error ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  private get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    return this.request('GET', path, undefined, params)
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request('POST', path, body)
  }

  private del<T>(path: string): Promise<T> {
    return this.request('DELETE', path)
  }

  // ── Projects ────────────────────────────────────────────────────────

  async listProjects(): Promise<Project[]> {
    return this.get('/api/data/projects')
  }

  async getProject(id: string): Promise<Project> {
    return this.get(`/api/data/projects/${id}`)
  }

  async createProject(data: {
    id?: string
    name: string
    description?: string
    workingDirectory?: string
    defaultMachineId?: string
    projectType?: string
    deliveryMode?: string
    [key: string]: unknown
  }): Promise<Project> {
    return this.post('/api/data/projects', data)
  }

  async deleteProject(id: string): Promise<{ ok: boolean }> {
    return this.del(`/api/data/projects/${id}`)
  }

  /**
   * Resolve a partial project ID to a full project.
   * Lists all projects and finds the one matching the prefix.
   * Throws if 0 or >1 matches.
   */
  async resolveProject(partialId: string): Promise<Project> {
    const projects = await this.listProjects()
    const matches = projects.filter(p => p.id.startsWith(partialId))
    if (matches.length === 0) throw new Error(`No project found matching "${partialId}"`)
    if (matches.length > 1) throw new Error(`Ambiguous ID "${partialId}" matches ${matches.length} projects`)
    return matches[0]
  }

  // ── Plan ────────────────────────────────────────────────────────────

  async getPlan(projectId: string): Promise<{ nodes: PlanNode[]; edges: PlanEdge[] }> {
    const result = await this.get<{ nodes: PlanNode[]; edges: PlanEdge[] }>(`/api/data/plan/${projectId}`)
    return {
      nodes: result.nodes ?? [],
      edges: result.edges ?? [],
    }
  }

  async getFullPlan(): Promise<{ nodes: PlanNode[]; edges: PlanEdge[] }> {
    const result = await this.get<{ nodes: PlanNode[]; edges: PlanEdge[] }>('/api/data/plan')
    return {
      nodes: result.nodes ?? [],
      edges: result.edges ?? [],
    }
  }

  // ── Executions ──────────────────────────────────────────────────────

  /**
   * Get executions map keyed by nodeClientId.
   * Server returns Record<nodeClientId, Execution>.
   */
  async getExecutions(): Promise<Record<string, Execution>> {
    return this.get('/api/data/executions')
  }

  // ── Tool Traces & File Changes ─────────────────────────────────────

  async listToolTraces(executionId: string): Promise<ToolTrace[]> {
    return this.get('/api/data/tool-traces', { executionId })
  }

  async listFileChanges(executionId: string): Promise<FileChange[]> {
    return this.get('/api/data/file-changes', { executionId })
  }

  // ── Usage / Cost ────────────────────────────────────────────────────

  async getUsageHistory(weeks = 1): Promise<{ date: string; tasksCompleted: number; totalCostUsd: number }[]> {
    return this.get('/api/data/usage/history', { weeks: String(weeks) })
  }

  // ── Activity ────────────────────────────────────────────────────────

  async listActivities(params?: { projectId?: string; limit?: string }): Promise<ActivityEvent[]> {
    return this.get('/api/data/activities', params)
  }

  // ── Machines ────────────────────────────────────────────────────────

  async listMachines(): Promise<Machine[]> {
    const result = await this.get<{ machines: Machine[] }>('/api/device/machines')
    return result.machines ?? []
  }

  async getMachine(id: string): Promise<Machine> {
    return this.get(`/api/device/machines/${id}`)
  }

  async revokeMachine(id: string): Promise<{ ok: boolean }> {
    return this.del(`/api/device/machines/${id}`)
  }

  /**
   * Resolve a partial machine ID to a full machine.
   * Lists all machines and finds the one matching the prefix.
   */
  async resolveMachine(partialId: string): Promise<Machine> {
    const machines = await this.listMachines()
    const matches = machines.filter(m => !m.isRevoked && m.id.startsWith(partialId))
    if (matches.length === 0) throw new Error(`No active machine found matching "${partialId}"`)
    if (matches.length > 1) throw new Error(`Ambiguous ID "${partialId}" matches ${matches.length} machines`)
    return matches[0]
  }

  // ── Observations ────────────────────────────────────────────────────

  async listObservations(executionId: string): Promise<{ data: ObservationEvent[] }> {
    return this.get('/api/observations', { executionId })
  }

  async getObservationStats(executionId: string): Promise<ObservationStats> {
    return this.get('/api/observations/stats', { executionId })
  }

  // ── Search ──────────────────────────────────────────────────────────

  async search(query: string): Promise<SearchResults> {
    return this.get('/api/data/search', { q: query })
  }

  // ── Plan CRUD ─────────────────────────────────────────────────────

  async createPlanNode(data: {
    id: string
    projectId: string
    title: string
    type?: string
    description?: string
    status?: string
    parentId?: string | null
    priority?: string | null
    milestoneId?: string | null
    dependencies?: string[]
    estimate?: string | null
    verification?: string
    dueDate?: string | null
    startDate?: string | null
    endDate?: string | null
    position?: { x: number; y: number }
  }): Promise<{ ok: boolean }> {
    return this.post('/api/data/plan/nodes', {
      type: 'task',
      status: 'planned',
      ...data,
    })
  }

  async updatePlanNode(nodeId: string, patch: Record<string, unknown>): Promise<{ ok: boolean }> {
    return this.request('PATCH', `/api/data/plan/nodes/${nodeId}`, patch)
  }

  async deletePlanNode(nodeId: string): Promise<{ ok: boolean }> {
    return this.del(`/api/data/plan/nodes/${nodeId}`)
  }

  async createPlanEdge(data: { id: string; projectId: string; source: string; target: string; type?: string }): Promise<{ ok: boolean }> {
    return this.post('/api/data/plan/edges', { type: 'dependency', ...data })
  }

  async deletePlanEdge(edgeId: string): Promise<{ ok: boolean }> {
    return this.del(`/api/data/plan/edges/${edgeId}`)
  }

  // ── Project Update ────────────────────────────────────────────────

  async updateProject(id: string, patch: Record<string, unknown>): Promise<Project> {
    return this.request('PATCH', `/api/data/projects/${id}`, patch)
  }

  // ── Cancel / Steer ────────────────────────────────────────────────

  async cancelTask(params: { nodeId?: string; executionId?: string; machineId?: string }): Promise<{ success: boolean }> {
    return this.post('/api/dispatch/cancel', params)
  }

  async steerTask(params: {
    taskId: string
    machineId: string
    message: string
    action?: 'guidance' | 'redirect' | 'pause' | 'resume'
  }): Promise<{ success: boolean }> {
    return this.post('/api/dispatch/steer', params)
  }

  // ── Relay / Environment ───────────────────────────────────────────

  async getRelayStatus(): Promise<Record<string, unknown>> {
    return this.get('/api/relay/status')
  }

  async getProviders(): Promise<Record<string, unknown>> {
    return this.get('/api/health/providers')
  }

  async getSlurmClusters(): Promise<unknown[]> {
    return this.get('/api/relay/slurm/clusters')
  }

  // ── Observations (extended) ───────────────────────────────────────

  async getTraceSummary(executionId: string): Promise<string> {
    const url = new URL(`/api/observations/${executionId}/summary`, this.baseUrl)
    const res = await fetch(url.toString(), { headers: this.headers })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`API error ${res.status}: ${text}`)
    }
    return res.text()
  }

  async listObservationsFiltered(params: {
    executionId?: string
    startAfter?: string
    startBefore?: string
    type?: string
    limit?: string
  }): Promise<{ data: ObservationEvent[] }> {
    return this.get('/api/observations', params as Record<string, string | undefined>)
  }

  // ── SSE Events Stream ─────────────────────────────────────────────

  async streamEvents(params?: { projectId?: string }): Promise<Response> {
    const url = new URL('/api/events/stream', this.baseUrl)
    if (params?.projectId) url.searchParams.set('projectId', params.projectId)
    const res = await fetch(url.toString(), {
      headers: {
        ...this.headers,
        Accept: 'text/event-stream',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`SSE connect failed (${res.status}): ${text}`)
    }
    return res
  }

  // ── Dispatch (SSE streaming) ────────────────────────────────────────

  /**
   * Dispatch a task for execution. Returns the raw Response for SSE streaming.
   */
  async dispatchTask(payload: {
    nodeId: string
    projectId: string
    force?: boolean
    targetMachineId?: string
    isInteractivePlan?: boolean
    model?: string
    preferredProvider?: string
    skipSafetyCheck?: boolean
    title?: string
    description?: string
    deliveryMode?: string
    [key: string]: unknown
  }): Promise<Response> {
    const url = new URL('/api/dispatch/task', this.baseUrl)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Dispatch failed (${res.status}): ${text}`)
    }
    return res
  }

  // ── Chat (SSE streaming) ──────────────────────────────────────────

  async projectChat(payload: {
    message: string; sessionId?: string; streamId?: string
    projectId: string; model?: string; providerId?: string
    visionDoc?: string; planNodes?: unknown[]; planEdges?: unknown[]
    selectedBackends?: string[]
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  }): Promise<Response> {
    const url = new URL('/api/agent/project-chat', this.baseUrl)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Project chat failed (${res.status}): ${text}`)
    }
    return res
  }

  async taskChat(payload: {
    message: string; sessionId?: string; streamId?: string
    nodeId: string; projectId: string; taskTitle: string
    taskDescription?: string; taskOutput?: string; visionDoc?: string
    model?: string; providerId?: string; selectedBackends?: string[]
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    branchName?: string; prUrl?: string
  }): Promise<Response> {
    const url = new URL('/api/agent/task-chat', this.baseUrl)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Task chat failed (${res.status}): ${text}`)
    }
    return res
  }

  // ── Approval ───────────────────────────────────────────────────────

  async sendApproval(payload: {
    taskId: string; machineId: string; requestId: string
    answered: boolean; answer?: string; message?: string
  }): Promise<{ success: boolean }> {
    return this.post('/api/dispatch/approval', payload)
  }

  // ── Summarize ──────────────────────────────────────────────────────

  async summarize(payload: {
    executionId: string
    projectId?: string
    nodeId?: string
  }): Promise<{ summary: string }> {
    return this.post('/api/agent/summarize', payload)
  }

  // ── Slurm Dispatch ────────────────────────────────────────────────

  async dispatchSlurmTask(payload: {
    task: { taskId: string; projectId: string; nodeId: string; title: string; description?: string; preferredProvider?: string }
    targetClusterId?: string
    slurmConfig?: {
      partition?: string; nodes?: number; cpusPerTask?: number; mem?: string; time?: string
      gpu?: { type?: string; count: number }; qos?: string; account?: string; modules?: string[]
    }
  }): Promise<Response> {
    const url = new URL('/api/relay/slurm/dispatch', this.baseUrl)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Slurm dispatch failed (${res.status}): ${text}`)
    }
    return res
  }
}

// ── SSE Stream Types ──────────────────────────────────────────────

export interface ApprovalRequest {
  requestId: string
  question: string
  options: string[]
  machineId?: string
  taskId?: string
}

export interface StreamResult {
  sessionId?: string
  metrics?: { durationMs?: number; inputTokens?: number; outputTokens?: number; totalCost?: number; model?: string }
  assistantText?: string
}

export interface StreamOptions {
  onApprovalRequest?: (data: ApprovalRequest) => Promise<{ answered: boolean; answer?: string }>
  json?: boolean
}

// ── SSE stream parser ─────────────────────────────────────────────
// Properly handles the standard SSE format with event: and data: fields.
// Matches the frontend's parseSSEStream from sse-parser.ts.

export async function readSSEStream(response: Response, handler: (event: Record<string, unknown>) => Promise<void> | void): Promise<void> {
  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''
  let dataLines: string[] = []

  function flushEvent(): Record<string, unknown> | null {
    if (!currentEvent) return null
    const data = dataLines.join('\n')
    const event = currentEvent
    currentEvent = ''
    dataLines = []

    // For text events, data is raw text (not JSON)
    if (event === 'text') {
      return { type: 'text', content: data, text: data }
    }

    // For structured events, parse JSON data
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>
      return { type: event, ...parsed }
    } catch {
      // If JSON parse fails, return raw data
      return { type: event, data }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        // Flush any pending event before starting a new one
        const pending = flushEvent()
        if (pending) await handler(pending)
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        const value = line.slice(5)
        dataLines.push(value.startsWith(' ') ? value.slice(1) : value)
      } else if (line === '') {
        // Empty line = end of event per SSE spec
        const pending = flushEvent()
        if (pending) await handler(pending)
      }
    }
  }

  // Flush any remaining event
  const pending = flushEvent()
  if (pending) await handler(pending)
}

// ── SSE Stream Helper ──────────────────────────────────────────────

/**
 * Stream SSE events from a dispatch response to stdout.
 */
export async function streamDispatchToStdout(response: Response, opts?: StreamOptions): Promise<StreamResult> {
  const result: StreamResult = {}

  if (!response.body) {
    console.log('Task dispatched (no stream)')
    return result
  }

  await readSSEStream(response, async (event) => {
    const type = event.type as string

    if (opts?.json) {
      console.log(JSON.stringify(event))
      return
    }

    switch (type) {
      case 'text':
        process.stdout.write((event.content as string) ?? '')
        break
      case 'tool_use':
        process.stderr.write(`\n[tool] ${event.toolName ?? event.name}\n`)
        break
      case 'tool_result':
        break
      case 'session_init':
        result.sessionId = event.sessionId as string
        break
      case 'result':
        console.log(`\n--- Result: ${event.status} ---`)
        if (event.summary) console.log(event.summary as string)
        if (event.durationMs || event.inputTokens || event.outputTokens || event.totalCost) {
          result.metrics = {
            durationMs: event.durationMs as number | undefined,
            inputTokens: event.inputTokens as number | undefined,
            outputTokens: event.outputTokens as number | undefined,
            totalCost: event.totalCost as number | undefined,
            model: event.model as string | undefined,
          }
        }
        break
      case 'plan_result':
        console.log('\n--- Plan Generated ---')
        console.log(JSON.stringify(event.plan ?? event, null, 2))
        break
      case 'approval_request':
        if (opts?.onApprovalRequest) {
          const approval = await opts.onApprovalRequest({
            requestId: event.requestId as string,
            question: event.question as string,
            options: event.options as string[],
            machineId: event.machineId as string | undefined,
            taskId: event.taskId as string | undefined,
          })
          // Caller is responsible for sending the approval via client.sendApproval
          void approval
        } else {
          process.stderr.write(`\n[approval] ${event.question}\n`)
          process.stderr.write(`  Options: ${(event.options as string[]).join(', ')}\n`)
        }
        break
      case 'error':
        console.error(`\nError: ${event.error ?? event.message}`)
        break
      case 'done':
      case 'heartbeat':
      case 'aborted':
        break
    }
  })

  return result
}

/**
 * Stream SSE events from a chat response to stdout.
 */
export async function streamChatToStdout(response: Response, opts?: StreamOptions): Promise<StreamResult> {
  const result: StreamResult = {}
  let assistantText = ''

  if (!response.body) {
    console.log('No stream received')
    return result
  }

  await readSSEStream(response, async (event) => {
    const type = event.type as string

    if (opts?.json) {
      console.log(JSON.stringify(event))
      return
    }

    switch (type) {
      case 'text':
        const content = (event.content as string) ?? ''
        process.stdout.write(content)
        assistantText += content
        break
      case 'tool_use':
        process.stderr.write(`\n[tool] ${event.toolName ?? event.name}\n`)
        break
      case 'tool_result':
        break
      case 'session_init':
        result.sessionId = event.sessionId as string
        break
      case 'file_change':
        process.stderr.write(`[file] ${event.action} ${event.path}\n`)
        break
      case 'compaction':
        process.stderr.write(`[compaction] History compacted: ${event.originalCount} → ${event.compactedCount} messages\n`)
        break
      case 'plan_result':
        console.log('\n--- Plan Generated ---')
        console.log(JSON.stringify(event.plan ?? event, null, 2))
        break
      case 'approval_request':
        if (opts?.onApprovalRequest) {
          const approval = await opts.onApprovalRequest({
            requestId: event.requestId as string,
            question: event.question as string,
            options: event.options as string[],
            machineId: event.machineId as string | undefined,
            taskId: event.taskId as string | undefined,
          })
          void approval
        } else {
          process.stderr.write(`\n[approval] ${event.question}\n`)
          process.stderr.write(`  Options: ${(event.options as string[]).join(', ')}\n`)
        }
        break
      case 'done':
        if (event.durationMs || event.inputTokens || event.outputTokens || event.totalCost) {
          result.metrics = {
            durationMs: event.durationMs as number | undefined,
            inputTokens: event.inputTokens as number | undefined,
            outputTokens: event.outputTokens as number | undefined,
            totalCost: event.totalCost as number | undefined,
            model: event.model as string | undefined,
          }
        }
        break
      case 'error':
        console.error(`\nError: ${event.message}`)
        break
      case 'heartbeat':
        break
    }
  })

  result.assistantText = assistantText
  return result
}

// ── Singleton ───────────────────────────────────────────────────────

let _client: AstroClient | null = null
let _clientUrl: string | undefined

/**
 * Get or create the shared AstroClient instance.
 * Uses the global --server-url option if set, otherwise config/default.
 * Recreates the client if the resolved URL differs from the cached one.
 */
export function getClient(serverUrl?: string): AstroClient {
  const resolvedUrl = getServerUrl(serverUrl)
  if (!_client || resolvedUrl !== _clientUrl) {
    _client = new AstroClient({ serverUrl })
    _clientUrl = resolvedUrl
  }
  return _client
}
