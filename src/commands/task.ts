import type { Command } from 'commander'
import chalk from 'chalk'
import { getClient, streamDispatchToStdout, streamChatToStdout } from '../client.js'
import type { PlanNode } from '../client.js'
import { print, formatRelativeTime, formatStatus, parseDateFilter, formatDuration, type ColumnDef } from '../output.js'
import { loadHistory, saveHistory, createApprovalHandler } from '../chat-utils.js'

export function registerTaskCommands(program: Command): void {
  const cmd = program.command('task').description('Manage tasks')

  cmd
    .command('list')
    .description('List tasks across projects')
    .option('--project <id>', 'Filter by project ID')
    .option('--status <status>', 'Filter by status (planned, in_progress, completed, etc.)')
    .option('--since <date>', 'Show tasks updated after date (e.g. 2d, 1h, today, ISO)')
    .option('--until <date>', 'Show tasks updated before date (e.g. 2d, 1h, yesterday, ISO)')
    .action(async (opts: { project?: string; status?: string; since?: string; until?: string }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      let nodes
      try {
        // Fetch nodes: scoped to project or all
        const result = opts.project
          ? await client.getPlan(opts.project)
          : await client.getFullPlan()
        nodes = result.nodes
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      // Filter out deleted and apply status filter
      let filtered = nodes.filter((n: PlanNode) => !n.deletedAt)
      if (opts.status) {
        filtered = filtered.filter((n: PlanNode) => n.status === opts.status)
      }
      if (opts.since) {
        const since = parseDateFilter(opts.since)
        filtered = filtered.filter((n: PlanNode) => n.updatedAt && new Date(n.updatedAt) >= since)
      }
      if (opts.until) {
        const until = parseDateFilter(opts.until)
        filtered = filtered.filter((n: PlanNode) => n.updatedAt && new Date(n.updatedAt) <= until)
      }

      // Sort by updatedAt descending
      filtered.sort((a: PlanNode, b: PlanNode) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return db - da
      })

      // Build projectId → name lookup
      const projects = await client.listProjects()
      const projectMap = new Map(projects.map(p => [p.id, p.name]))

      // Build display rows
      const rows = filtered.map((n: PlanNode) => ({
        id: n.id,
        title: n.title,
        status: n.status,
        projectName: projectMap.get(n.projectId) ?? n.projectId,
        updatedAt: n.updatedAt,
      }))

      if (isJson) {
        print(rows, { json: true })
        return
      }

      const columns: ColumnDef[] = [
        { key: 'id', label: 'ID', width: 12 },
        { key: 'title', label: 'TITLE', width: 40 },
        { key: 'status', label: 'STATUS', width: 18, format: (v) => formatStatus(String(v ?? '')) },
        { key: 'projectName', label: 'PROJECT', width: 20 },
        { key: 'updatedAt', label: 'UPDATED', width: 12, format: (v) => formatRelativeTime(v as string | Date | null) },
      ]

      print(rows, { columns })
    })

  cmd
    .command('show <id>')
    .description('Show task details')
    .action(async (clientId: string) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      let nodes
      try {
        // Find the plan node by clientId across all projects
        const result = await client.getFullPlan()
        nodes = result.nodes
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }
      const node = nodes.find((n: PlanNode) => n.id === clientId && !n.deletedAt)

      if (!node) {
        console.error(chalk.red(`Task not found: ${clientId}`))
        process.exitCode = 1
        return
      }

      let projectName: string
      let latestExecution: Awaited<ReturnType<typeof client.getExecutions>>[string] | null
      let changes: Array<{
        id: string
        executionId: string
        path: string
        action: string
        linesAdded: number | null
        linesRemoved: number | null
        timestamp: string
      }> = []
      try {
        // Get project name
        const projects = await client.listProjects()
        const project = projects.find(p => p.id === node.projectId)
        projectName = project?.name ?? node.projectId

        // Get execution for this node
        const executionMap = await client.getExecutions()
        latestExecution = executionMap[node.id] ?? null

        // Get file changes if execution exists
        if (latestExecution?.executionId) {
          changes = await client.listFileChanges(latestExecution.executionId)
        }
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      if (isJson) {
        print({ ...node, projectName, execution: latestExecution, fileChanges: changes }, { json: true })
        return
      }

      // Human-friendly output
      console.log()
      console.log(chalk.bold(node.title))
      console.log(chalk.dim('\u2500'.repeat(60)))
      console.log(`  ${chalk.dim('ID:')}           ${node.id}`)
      console.log(`  ${chalk.dim('Type:')}         ${node.type}`)
      console.log(`  ${chalk.dim('Status:')}       ${formatStatus(node.status)}`)
      console.log(`  ${chalk.dim('Project:')}      ${projectName}`)
      if (node.priority) {
        console.log(`  ${chalk.dim('Priority:')}     ${node.priority}`)
      }
      if (node.estimate) {
        console.log(`  ${chalk.dim('Estimate:')}     ${node.estimate}`)
      }
      if (node.startDate) {
        console.log(`  ${chalk.dim('Start Date:')}   ${node.startDate}`)
      }
      if (node.endDate) {
        console.log(`  ${chalk.dim('End Date:')}     ${node.endDate}`)
      }
      if (node.dueDate) {
        console.log(`  ${chalk.dim('Due Date:')}     ${node.dueDate}`)
      }
      if (node.branchName) {
        console.log(`  ${chalk.dim('Branch:')}       ${node.branchName}`)
      }
      if (node.prUrl) {
        console.log(`  ${chalk.dim('PR:')}           ${node.prUrl}`)
      }
      if (node.description) {
        console.log()
        console.log(chalk.dim('  Description:'))
        console.log(`  ${node.description}`)
      }
      console.log()
      console.log(`  ${chalk.dim('Created:')}      ${formatRelativeTime(node.createdAt)}`)
      console.log(`  ${chalk.dim('Updated:')}      ${formatRelativeTime(node.updatedAt)}`)

      // Latest execution
      if (latestExecution) {
        console.log()
        console.log(chalk.bold('  Latest Execution'))
        console.log(chalk.dim('  ' + '\u2500'.repeat(56)))
        console.log(`    ${chalk.dim('Execution ID:')}  ${latestExecution.executionId}`)
        console.log(`    ${chalk.dim('Status:')}        ${formatStatus(latestExecution.status)}`)
        if (latestExecution.providerName) {
          console.log(`    ${chalk.dim('Provider:')}      ${latestExecution.providerName}`)
        }
        if (latestExecution.model) {
          console.log(`    ${chalk.dim('Model:')}         ${latestExecution.model}`)
        }
        if (latestExecution.machineId) {
          console.log(`    ${chalk.dim('Machine:')}       ${latestExecution.machineId}`)
        }
        console.log(`    ${chalk.dim('Started:')}       ${formatRelativeTime(latestExecution.startedAt)}`)
        if (latestExecution.completedAt) {
          console.log(`    ${chalk.dim('Completed:')}     ${formatRelativeTime(latestExecution.completedAt)}`)
        }
        if (latestExecution.durationMs != null) {
          const secs = (latestExecution.durationMs / 1000).toFixed(1)
          console.log(`    ${chalk.dim('Duration:')}      ${secs}s`)
        }
        if (latestExecution.tokensUsed != null) {
          console.log(`    ${chalk.dim('Tokens:')}        ${latestExecution.tokensUsed.toLocaleString()}`)
        }
        if (latestExecution.estimatedCostUsd != null) {
          console.log(`    ${chalk.dim('Cost:')}          $${latestExecution.estimatedCostUsd.toFixed(4)}`)
        }
        if (latestExecution.error) {
          console.log(`    ${chalk.red('Error:')}         ${latestExecution.error}`)
        }
        if (latestExecution.markdownSummary) {
          console.log()
          console.log(chalk.dim('    Summary:'))
          console.log(`    ${latestExecution.markdownSummary}`)
        }
      }

      // File changes
      if (changes.length > 0) {
        console.log()
        console.log(chalk.bold('  File Changes'))
        console.log(chalk.dim('  ' + '\u2500'.repeat(56)))
        for (const fc of changes) {
          const actionColor = fc.action === 'create' ? chalk.green : fc.action === 'delete' ? chalk.red : chalk.yellow
          const stats = []
          if (fc.linesAdded != null && fc.linesAdded > 0) stats.push(chalk.green(`+${fc.linesAdded}`))
          if (fc.linesRemoved != null && fc.linesRemoved > 0) stats.push(chalk.red(`-${fc.linesRemoved}`))
          const statsStr = stats.length > 0 ? ` (${stats.join(', ')})` : ''
          console.log(`    ${actionColor(fc.action.padEnd(8))} ${fc.path}${statsStr}`)
        }
      }

      console.log()
    })

  cmd
    .command('dispatch <id>')
    .description('Dispatch a task for execution')
    .requiredOption('--project-id <id>', 'Project ID')
    .option('--force', 'Force re-dispatch even if already running')
    .option('--machine <id>', 'Target machine ID')
    .option('--model <model>', 'AI model to use')
    .option('--provider <provider>', 'Preferred provider ID')
    .option('--yolo', 'Auto-approve all approval requests')
    .option('--slurm', 'Dispatch to Slurm cluster')
    .option('--slurm-partition <p>', 'Slurm partition')
    .option('--slurm-gpus <n>', 'Number of GPUs', parseInt)
    .option('--slurm-gpu-type <t>', 'GPU type (e.g. a100, v100)')
    .option('--slurm-mem <m>', 'Memory (e.g. 16G, 64G)')
    .option('--slurm-time <t>', 'Time limit (e.g. 1:00:00)')
    .option('--slurm-nodes <n>', 'Number of nodes', parseInt)
    .option('--slurm-cpus <n>', 'CPUs per task', parseInt)
    .option('--slurm-qos <q>', 'Quality of service')
    .option('--slurm-account <a>', 'Slurm account')
    .option('--slurm-modules <m>', 'Comma-separated modules to load')
    .option('--cluster <id>', 'Target Slurm cluster ID')
    .action(async (nodeId: string, opts: {
      projectId: string; force?: boolean; machine?: string
      model?: string; provider?: string; yolo?: boolean
      slurm?: boolean; slurmPartition?: string; slurmGpus?: number
      slurmGpuType?: string; slurmMem?: string; slurmTime?: string
      slurmNodes?: number; slurmCpus?: number; slurmQos?: string
      slurmAccount?: string; slurmModules?: string; cluster?: string
    }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      console.log(chalk.dim(`Dispatching task ${chalk.bold(nodeId)} to server...`))
      console.log()

      try {
        // Slurm dispatch path
        if (opts.slurm) {
          const slurmConfig: Record<string, unknown> = {}
          if (opts.slurmPartition) slurmConfig.partition = opts.slurmPartition
          if (opts.slurmNodes) slurmConfig.nodes = opts.slurmNodes
          if (opts.slurmCpus) slurmConfig.cpusPerTask = opts.slurmCpus
          if (opts.slurmMem) slurmConfig.mem = opts.slurmMem
          if (opts.slurmTime) slurmConfig.time = opts.slurmTime
          if (opts.slurmQos) slurmConfig.qos = opts.slurmQos
          if (opts.slurmAccount) slurmConfig.account = opts.slurmAccount
          if (opts.slurmModules) slurmConfig.modules = opts.slurmModules.split(',').map(s => s.trim())
          if (opts.slurmGpus || opts.slurmGpuType) {
            slurmConfig.gpu = { count: opts.slurmGpus ?? 1, type: opts.slurmGpuType }
          }

          const response = await client.dispatchSlurmTask({
            task: {
              taskId: `exec-${nodeId}-${Date.now()}`,
              projectId: opts.projectId,
              nodeId,
              title: nodeId,
              preferredProvider: opts.provider,
            },
            targetClusterId: opts.cluster,
            slurmConfig: Object.keys(slurmConfig).length > 0 ? slurmConfig as Parameters<typeof client.dispatchSlurmTask>[0]['slurmConfig'] : undefined,
          })
          await streamDispatchToStdout(response, { json: isJson })
          console.log()
          console.log(chalk.green('Slurm dispatch complete.'))
          return
        }

        // Standard dispatch path
        const approvalHandler = createApprovalHandler(client, !!opts.yolo)

        const response = await client.dispatchTask({
          nodeId,
          projectId: opts.projectId,
          force: opts.force,
          targetMachineId: opts.machine,
          model: opts.model,
          preferredProvider: opts.provider,
        })
        await streamDispatchToStdout(response, {
          json: isJson,
          onApprovalRequest: approvalHandler,
        })
        console.log()
        console.log(chalk.green('Task dispatch complete.'))
      } catch (err) {
        console.error(chalk.red(`Dispatch failed: ${err instanceof Error ? err.message : String(err)}`))
        process.exitCode = 1
      }
    })

  // ── task chat ────────────────────────────────────────────────────
  cmd
    .command('chat <nodeId>')
    .description('Chat with AI about a specific task')
    .requiredOption('--project-id <id>', 'Project ID')
    .requiredOption('--message <msg>', 'Message to send')
    .option('--session-id <sid>', 'Resume existing session')
    .option('--model <model>', 'AI model to use')
    .option('--provider <provider>', 'Provider ID')
    .option('--history-file <path>', 'Path to conversation history JSON file')
    .option('--yolo', 'Auto-approve all approval requests')
    .action(async (nodeId: string, cmdOpts: {
      projectId: string
      message: string
      sessionId?: string
      model?: string
      provider?: string
      historyFile?: string
      yolo?: boolean
    }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      // Find the task node
      let node: PlanNode | undefined
      try {
        const { nodes } = await client.getPlan(cmdOpts.projectId)
        node = nodes.find(n => n.id === nodeId && !n.deletedAt)
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      if (!node) {
        console.error(chalk.red(`Task not found: ${nodeId}`))
        process.exitCode = 1
        return
      }

      // Load project for vision doc
      let visionDoc: string | undefined
      try {
        const project = await client.getProject(cmdOpts.projectId)
        visionDoc = project.visionDoc || undefined
      } catch {
        // Vision doc is optional
      }

      // Load message history
      let messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
      if (cmdOpts.historyFile) {
        messages = loadHistory(cmdOpts.historyFile)
      }

      try {
        const response = await client.taskChat({
          message: cmdOpts.message,
          nodeId,
          projectId: cmdOpts.projectId,
          taskTitle: node.title,
          taskDescription: node.description || undefined,
          taskOutput: node.executionOutput || undefined,
          visionDoc,
          sessionId: cmdOpts.sessionId,
          model: cmdOpts.model,
          providerId: cmdOpts.provider,
          branchName: node.branchName || undefined,
          prUrl: node.prUrl || undefined,
          messages: messages.length > 0 ? messages : undefined,
        })

        const approvalHandler = createApprovalHandler(client, !!cmdOpts.yolo)

        const result = await streamChatToStdout(response, {
          json: isJson,
          onApprovalRequest: approvalHandler,
        })

        if (result.sessionId) {
          process.stderr.write(`\n${chalk.dim(`Session: ${result.sessionId}`)}\n`)
        }

        // Save history
        if (cmdOpts.historyFile && result.assistantText) {
          messages.push({ role: 'user', content: cmdOpts.message })
          messages.push({ role: 'assistant', content: result.assistantText })
          saveHistory(cmdOpts.historyFile, messages)
        }

        console.log() // Final newline
      } catch (err) {
        console.error(chalk.red(`Chat failed: ${err instanceof Error ? err.message : String(err)}`))
        process.exitCode = 1
      }
    })

  // ── task cancel ───────────────────────────────────────────────────
  cmd
    .command('cancel <executionId>')
    .description('Cancel a running task execution')
    .option('--machine <id>', 'Target machine ID')
    .option('--node-id <id>', 'Node ID')
    .action(async (executionId: string, opts: { machine?: string; nodeId?: string }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      try {
        const result = await client.cancelTask({
          executionId,
          machineId: opts.machine,
          nodeId: opts.nodeId,
        })

        if (isJson) {
          print(result, { json: true })
        } else {
          console.log(chalk.green(`Task ${executionId} cancelled.`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (isJson) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Cancel failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── task steer ────────────────────────────────────────────────────
  cmd
    .command('steer <executionId>')
    .description('Send steering guidance to a running task')
    .requiredOption('--machine <id>', 'Target machine ID')
    .requiredOption('--message <msg>', 'Steering message')
    .option('--action <action>', 'Action type: guidance, redirect, pause, resume')
    .action(async (executionId: string, opts: { machine: string; message: string; action?: string }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      try {
        const result = await client.steerTask({
          taskId: executionId,
          machineId: opts.machine,
          message: opts.message,
          action: opts.action as 'guidance' | 'redirect' | 'pause' | 'resume' | undefined,
        })

        if (isJson) {
          print(result, { json: true })
        } else {
          console.log(chalk.green(`Steering message sent to ${executionId}.`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (isJson) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Steer failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── task update-status ────────────────────────────────────────────
  cmd
    .command('update-status <nodeId>')
    .description('Update a task node status')
    .requiredOption('--status <status>', 'New status (planned, in_progress, completed, etc.)')
    .action(async (nodeId: string, opts: { status: string }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      try {
        const result = await client.updatePlanNode(nodeId, { status: opts.status })

        if (isJson) {
          print(result, { json: true })
        } else {
          console.log(chalk.green(`Task ${nodeId} status updated to ${formatStatus(opts.status)}.`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (isJson) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Update failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── task watch ────────────────────────────────────────────────────
  cmd
    .command('watch <executionId>')
    .description('Watch real-time output from a running task via SSE')
    .option('--yolo', 'Auto-approve all approval requests')
    .action(async (executionId: string, cmdOpts: { yolo?: boolean }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json
      const approvalHandler = createApprovalHandler(client, !!cmdOpts.yolo)

      try {
        const response = await client.streamEvents()
        if (!response.body) {
          console.error(chalk.red('No stream body received'))
          process.exitCode = 1
          return
        }

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
              const event = JSON.parse(line.slice(6)) as {
                type: string
                taskId?: string
                content?: string
                name?: string
                status?: string
                message?: string
                summary?: string
                data?: string
                duration?: number
              }

              // Filter events for this execution
              if (event.taskId && event.taskId !== executionId) continue

              if (isJson) {
                console.log(JSON.stringify(event))
                continue
              }

              switch (event.type) {
                case 'task:text':
                  process.stdout.write(event.content ?? event.data ?? '')
                  break
                case 'task:tool_trace':
                  console.log(chalk.dim(`[tool] ${event.name ?? 'unknown'}`))
                  break
                case 'task:result':
                  console.log(`\n${chalk.bold('--- Result:')} ${formatStatus(event.status ?? 'unknown')} ${event.duration != null ? chalk.dim(`(${formatDuration(event.duration)})`) : ''}`)
                  if (event.summary) console.log(event.summary)
                  reader.cancel()
                  return
                case 'task:progress':
                  if (event.message) console.log(chalk.dim(`[progress] ${event.message}`))
                  break
                case 'task:stdout':
                  process.stdout.write(event.data ?? '')
                  break
                case 'task:approval_request': {
                  const result = await approvalHandler({
                    requestId: (event as Record<string, unknown>).requestId as string,
                    question: (event as Record<string, unknown>).question as string,
                    options: (event as Record<string, unknown>).options as string[],
                    machineId: (event as Record<string, unknown>).machineId as string | undefined,
                    taskId: (event as Record<string, unknown>).taskId as string | undefined,
                  })
                  void result
                  break
                }
              }
            } catch {
              // Skip non-JSON data lines
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (isJson) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Watch failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })
}
