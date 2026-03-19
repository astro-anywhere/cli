import type { Command } from 'commander'
import { getClient, streamDispatchToStdout } from '../client.js'
import { print, formatRelativeTime, formatStatus, type ColumnDef } from '../output.js'
import { createApprovalHandler } from '../chat-utils.js'
import chalk from 'chalk'

const nodeColumns: ColumnDef[] = [
  { key: 'id', label: 'ID', width: 20 },
  { key: 'title', label: 'TITLE', width: 40 },
  { key: 'type', label: 'TYPE', width: 10 },
  { key: 'status', label: 'STATUS', width: 18, format: (v) => formatStatus(String(v ?? '')) },
  { key: 'startDate', label: 'START', width: 12, format: (v) => v ? String(v) : chalk.dim('\u2014') },
  { key: 'endDate', label: 'END', width: 12, format: (v) => v ? String(v) : chalk.dim('\u2014') },
]

// ── Tree rendering helpers ────────────────────────────────────────────

interface TreeNode {
  id: string
  title: string
  status: string
  type: string
  children: TreeNode[]
}

function buildTree(
  nodes: Array<{ id: string; title: string; status: string; type: string }>,
  edges: Array<{ source: string; target: string }>
): TreeNode[] {
  const adj = new Map<string, string[]>()
  const hasParent = new Set<string>()

  for (const edge of edges) {
    const children = adj.get(edge.source) ?? []
    children.push(edge.target)
    adj.set(edge.source, children)
    hasParent.add(edge.target)
  }

  const lookup = new Map<string, { id: string; title: string; status: string; type: string }>()
  for (const node of nodes) {
    lookup.set(node.id, node)
  }

  function buildSubtree(nodeId: string): TreeNode | null {
    const node = lookup.get(nodeId)
    if (!node) return null
    const childIds = adj.get(nodeId) ?? []
    const children: TreeNode[] = []
    for (const childId of childIds) {
      const child = buildSubtree(childId)
      if (child) children.push(child)
    }
    return { ...node, children }
  }

  const roots: TreeNode[] = []
  for (const node of nodes) {
    if (!hasParent.has(node.id)) {
      const tree = buildSubtree(node.id)
      if (tree) roots.push(tree)
    }
  }

  return roots
}

function renderTreeLines(roots: TreeNode[]): string[] {
  const lines: string[] = []

  function walk(node: TreeNode, prefix: string, isLast: boolean) {
    const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 '
    const statusStr = formatStatus(node.status)
    const typeTag = chalk.dim(`[${node.type}]`)
    lines.push(`${prefix}${connector}${chalk.bold(node.id)}: ${node.title} ${typeTag} ${statusStr}`)

    const childPrefix = prefix + (isLast ? '    ' : '\u2502   ')
    for (let i = 0; i < node.children.length; i++) {
      walk(node.children[i], childPrefix, i === node.children.length - 1)
    }
  }

  for (let i = 0; i < roots.length; i++) {
    walk(roots[i], '', i === roots.length - 1)
  }

  return lines
}

// ── ID validation helper ─────────────────────────────────────────────

/**
 * Validate that the given node IDs exist in the project plan.
 * Returns an error string if any are invalid, or null if all OK.
 * Prints a helpful message listing valid IDs so the agent can self-correct.
 */
async function validateNodeIds(
  client: ReturnType<typeof getClient>,
  projectId: string,
  ids: { id: string; role: string }[],
  json: boolean,
): Promise<string | null> {
  if (ids.length === 0) return null
  let nodes: Array<{ id: string; title: string; type: string }>
  try {
    const plan = await client.getPlan(projectId)
    nodes = plan.nodes
  } catch (err) {
    return `Failed to fetch plan for validation: ${err instanceof Error ? err.message : String(err)}`
  }
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const errors: string[] = []
  for (const { id, role } of ids) {
    if (!nodeMap.has(id)) {
      const available = nodes.slice(0, 10).map(n => `  ${n.id}  (${n.type}) ${n.title}`).join('\n')
      errors.push(`${role} "${id}" not found in project. Valid node IDs:\n${available}`)
    }
  }
  return errors.length > 0 ? errors.join('\n') : null
}

async function readPlanJsonFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('No plan JSON received on stdin. Pipe a JSON document into `astro-cli plan create`.')
  }

  return new Promise((resolve, reject) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => {
      resolve(raw)
    })
    process.stdin.on('error', reject)
  })
}

// ── Command registration ──────────────────────────────────────────────

export function registerPlanCommands(program: Command): void {
  const plan = program.command('plan').description('Manage plans')

  // ── plan create ───────────────────────────────────────────────────
  plan
    .command('create')
    .description('Create or replace a full project plan from JSON on stdin')
    .requiredOption('--project-id <id>', 'Project ID')
    .action(async (cmdOpts: { projectId: string }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      try {
        const raw = await readPlanJsonFromStdin()
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const nodes = parsed.nodes
        const edges = parsed.edges
        const projectName = typeof parsed.projectName === 'string' ? parsed.projectName : undefined

        if (!Array.isArray(nodes) || !Array.isArray(edges)) {
          throw new Error('Plan JSON must be an object with `nodes` and `edges` arrays.')
        }

        const result = await client.setPlan(
          cmdOpts.projectId,
          nodes as Array<Record<string, unknown>>,
          edges as Array<Record<string, unknown>>,
          projectName,
        )

        if (opts.json) {
          print({
            ...result,
            projectId: cmdOpts.projectId,
            projectName,
            nodeCount: nodes.length,
            edgeCount: edges.length,
          }, { json: true })
        } else {
          console.log(chalk.green('Plan created:'))
          console.log(`  ${chalk.bold('Project ID')}  ${cmdOpts.projectId}`)
          if (projectName) {
            console.log(`  ${chalk.bold('Name')}        ${projectName}`)
          }
          console.log(`  ${chalk.bold('Nodes')}       ${nodes.length}`)
          console.log(`  ${chalk.bold('Edges')}       ${edges.length}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (opts.json) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Create plan failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── plan list ─────────────────────────────────────────────────────
  plan
    .command('list')
    .description('List plan nodes for a project')
    .requiredOption('--project-id <id>', 'Project ID')
    .action(async (cmdOpts: { projectId: string }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      try {
        const { nodes } = await client.getPlan(cmdOpts.projectId)
        print(nodes, { json: opts.json, columns: nodeColumns })
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
      }
    })

  // ── plan show <nodeId> ────────────────────────────────────────────
  plan
    .command('show <nodeId>')
    .description('Show plan node details')
    .option('--project-id <id>', 'Project ID (narrows search)')
    .action(async (nodeId: string, cmdOpts: { projectId?: string }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      let nodes
      try {
        const result = cmdOpts.projectId
          ? await client.getPlan(cmdOpts.projectId)
          : await client.getFullPlan()
        nodes = result.nodes
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      const node = nodes.find(n => n.id === nodeId)

      if (!node) {
        console.error(chalk.red(`No plan node found with ID "${nodeId}"`))
        process.exitCode = 1
        return
      }

      if (opts.json) {
        print(node, { json: true })
        return
      }

      const fields: [string, unknown][] = [
        ['ID', node.id],
        ['Title', node.title],
        ['Type', node.type],
        ['Status', formatStatus(node.status)],
        ['Description', node.description || chalk.dim('\u2014')],
        ['Project ID', node.projectId],
        ['Parent ID', node.parentId || chalk.dim('\u2014')],
        ['Priority', node.priority || chalk.dim('\u2014')],
        ['Estimate', node.estimate || chalk.dim('\u2014')],
        ['Start Date', node.startDate || chalk.dim('\u2014')],
        ['End Date', node.endDate || chalk.dim('\u2014')],
        ['Due Date', node.dueDate || chalk.dim('\u2014')],
        ['Milestone ID', (node as Record<string, unknown>).milestoneId || chalk.dim('\u2014')],
        ['Verification', (node as Record<string, unknown>).verification ?? chalk.dim('\u2014')],
        ['Branch Name', node.branchName || chalk.dim('\u2014')],
        ['PR URL', node.prUrl || chalk.dim('\u2014')],
        ['Execution ID', node.executionId || chalk.dim('\u2014')],
        ['Execution Started', node.executionStartedAt ? formatRelativeTime(node.executionStartedAt) : chalk.dim('\u2014')],
        ['Execution Completed', node.executionCompletedAt ? formatRelativeTime(node.executionCompletedAt) : chalk.dim('\u2014')],
        ['Created', formatRelativeTime(node.createdAt)],
        ['Updated', formatRelativeTime(node.updatedAt)],
      ]

      const maxKeyLen = Math.max(...fields.map(([k]) => k.length))
      for (const [key, value] of fields) {
        console.log(`  ${chalk.bold(key.padEnd(maxKeyLen))}  ${value}`)
      }

      if (node.executionOutput) {
        console.log()
        console.log(chalk.bold('  Execution Output:'))
        const output = node.executionOutput.slice(0, 500)
        console.log(`  ${output}${node.executionOutput.length > 500 ? '...' : ''}`)
      }

      if (node.executionError) {
        console.log()
        console.log(chalk.bold.red('  Execution Error:'))
        console.log(`  ${node.executionError}`)
      }
    })

  // ── plan tree ─────────────────────────────────────────────────────
  plan
    .command('tree')
    .description('Show ASCII dependency tree for a project')
    .requiredOption('--project-id <id>', 'Project ID')
    .action(async (cmdOpts: { projectId: string }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      let nodes, edges
      try {
        const result = await client.getPlan(cmdOpts.projectId)
        nodes = result.nodes
        edges = result.edges
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      if (nodes.length === 0) {
        console.log(chalk.dim('  No plan nodes found.'))
        return
      }

      if (opts.json) {
        const tree = buildTree(nodes, edges)
        print(tree, { json: true })
        return
      }

      const tree = buildTree(nodes, edges)
      const lines = renderTreeLines(tree)

      if (lines.length === 0) {
        console.log(chalk.dim('  No plan nodes found.'))
        return
      }

      console.log()
      console.log(chalk.bold(`  Plan tree (${nodes.length} nodes, ${edges.length} edges):`))
      console.log()
      for (const line of lines) {
        console.log(`  ${line}`)
      }
      console.log()
    })

  // ── plan create-node ──────────────────────────────────────────────
  plan
    .command('create-node')
    .description('Create a new plan node')
    .requiredOption('--project-id <id>', 'Project ID')
    .requiredOption('--title <title>', 'Node title')
    .option('--type <type>', 'Node type: task, milestone, decision', 'task')
    .option('--description <desc>', 'Node description')
    .option('--status <status>', 'Initial status', 'planned')
    .option('--parent-id <id>', 'Parent node ID')
    .option('--priority <priority>', 'Priority: critical, high, normal, low')
    .option('--milestone-id <id>', 'Milestone node ID to link this task to')
    .option('--dependency <nodeId>', 'Dependency node ID (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc }, [] as string[])
    .option('--estimate <size>', 'Estimate: XS | S | M | L | XL')
    .option('--verification <type>', 'Verification type: auto | human', 'auto')
    .option('--due-date <YYYY-MM-DD>', 'Due date')
    .option('--start-date <YYYY-MM-DD>', 'Start date')
    .option('--end-date <YYYY-MM-DD>', 'End date')
    .action(async (cmdOpts: {
      projectId: string
      title: string
      type: string
      description?: string
      status: string
      parentId?: string
      priority?: string
      milestoneId?: string
      dependency: string[]
      estimate?: string
      verification?: string
      dueDate?: string
      startDate?: string
      endDate?: string
    }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      // Generate a client ID
      const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      // Validate referenced IDs before submitting
      const idsToValidate = [
        ...cmdOpts.dependency.map(d => ({ id: d, role: '--dependency' })),
        ...(cmdOpts.milestoneId ? [{ id: cmdOpts.milestoneId, role: '--milestone-id' }] : []),
      ]
      if (idsToValidate.length > 0) {
        const validationError = await validateNodeIds(client, cmdOpts.projectId, idsToValidate, opts.json)
        if (validationError) {
          if (opts.json) {
            print({ error: validationError }, { json: true })
          } else {
            console.error(chalk.red(`Validation failed:\n${validationError}`))
          }
          process.exitCode = 1
          return
        }
      }

      try {
        await client.createPlanNode({
          id,
          projectId: cmdOpts.projectId,
          title: cmdOpts.title,
          type: cmdOpts.type,
          description: cmdOpts.description,
          status: cmdOpts.status,
          parentId: cmdOpts.parentId ?? null,
          priority: cmdOpts.priority ?? null,
          milestoneId: cmdOpts.milestoneId ?? null,
          dependencies: cmdOpts.dependency.length > 0 ? cmdOpts.dependency : undefined,
          estimate: cmdOpts.estimate ?? null,
          verification: cmdOpts.verification,
          dueDate: cmdOpts.dueDate ?? null,
          startDate: cmdOpts.startDate ?? null,
          endDate: cmdOpts.endDate ?? null,
        })

        if (opts.json) {
          print({ ok: true, id, projectId: cmdOpts.projectId, title: cmdOpts.title }, { json: true })
        } else {
          console.log(chalk.green('Node created:'))
          console.log(`  ${chalk.bold('ID')}     ${id}`)
          console.log(`  ${chalk.bold('Title')}  ${cmdOpts.title}`)
          console.log(`  ${chalk.bold('Type')}   ${cmdOpts.type}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (opts.json) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Create failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── plan update-node ──────────────────────────────────────────────
  plan
    .command('update-node <nodeId>')
    .description('Update a plan node')
    .option('--title <title>', 'New title')
    .option('--status <status>', 'New status')
    .option('--description <desc>', 'New description')
    .option('--priority <priority>', 'New priority: critical, high, normal, low')
    .option('--type <type>', 'New type: task, milestone, decision')
    .option('--milestone-id <id>', 'Milestone node ID')
    .option('--add-dependency <nodeId>', 'Add a dependency node ID (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc }, [] as string[])
    .option('--remove-dependency <nodeId>', 'Remove a dependency node ID (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc }, [] as string[])
    .option('--estimate <size>', 'Estimate: XS | S | M | L | XL')
    .option('--verification <type>', 'Verification type: auto | human')
    .option('--due-date <YYYY-MM-DD>', 'Due date')
    .option('--start-date <YYYY-MM-DD>', 'Start date')
    .option('--end-date <YYYY-MM-DD>', 'End date')
    .action(async (nodeId: string, cmdOpts: {
      title?: string
      status?: string
      description?: string
      priority?: string
      type?: string
      milestoneId?: string
      addDependency: string[]
      removeDependency: string[]
      estimate?: string
      verification?: string
      dueDate?: string
      startDate?: string
      endDate?: string
    }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      const patch: Record<string, unknown> = {}
      if (cmdOpts.title !== undefined) patch.title = cmdOpts.title
      if (cmdOpts.status !== undefined) patch.status = cmdOpts.status
      if (cmdOpts.description !== undefined) patch.description = cmdOpts.description
      if (cmdOpts.priority !== undefined) patch.priority = cmdOpts.priority
      if (cmdOpts.type !== undefined) patch.type = cmdOpts.type
      if (cmdOpts.milestoneId !== undefined) patch.milestoneId = cmdOpts.milestoneId
      if (cmdOpts.estimate !== undefined) patch.estimate = cmdOpts.estimate
      if (cmdOpts.verification !== undefined) patch.verification = cmdOpts.verification
      if (cmdOpts.dueDate !== undefined) patch.dueDate = cmdOpts.dueDate
      if (cmdOpts.startDate !== undefined) patch.startDate = cmdOpts.startDate
      if (cmdOpts.endDate !== undefined) patch.endDate = cmdOpts.endDate

      // Handle dependency add/remove: fetch current node, patch dependencies list
      if (cmdOpts.addDependency.length > 0 || cmdOpts.removeDependency.length > 0) {
        try {
          const { nodes } = await client.getFullPlan()
          const node = nodes.find((n: { id: string }) => n.id === nodeId)
          if (!node) {
            console.error(chalk.red(`Node ${nodeId} not found`))
            process.exitCode = 1
            return
          }
          const currentDeps: string[] = (node as Record<string, unknown>).dependencies as string[] ?? []
          const toRemove = new Set(cmdOpts.removeDependency)
          const newDeps = [...currentDeps.filter((d: string) => !toRemove.has(d)), ...cmdOpts.addDependency.filter((d: string) => !currentDeps.includes(d))]
          patch.dependencies = newDeps
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (opts.json) {
            print({ error: `Failed to fetch node for dependency update: ${msg}` }, { json: true })
          } else {
            console.error(chalk.red(`Failed to fetch node for dependency update: ${msg}`))
          }
          process.exitCode = 1
          return
        }
      }

      if (Object.keys(patch).length === 0) {
        console.error(chalk.red('No update fields provided.'))
        process.exitCode = 1
        return
      }

      try {
        const result = await client.updatePlanNode(nodeId, patch)

        if (opts.json) {
          print({ ...result, nodeId, updated: Object.keys(patch) }, { json: true })
        } else {
          console.log(chalk.green(`Node ${nodeId} updated: ${Object.keys(patch).join(', ')}`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (opts.json) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Update failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── plan delete-node ──────────────────────────────────────────────
  plan
    .command('delete-node <nodeId>')
    .description('Delete a plan node')
    .action(async (nodeId: string) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      try {
        const result = await client.deletePlanNode(nodeId)

        if (opts.json) {
          print({ ...result, nodeId }, { json: true })
        } else {
          console.log(chalk.green(`Node ${nodeId} deleted.`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (opts.json) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Delete failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── plan add-edge ─────────────────────────────────────────────────
  plan
    .command('add-edge')
    .description('Add a dependency edge between two plan nodes')
    .requiredOption('--project-id <id>', 'Project ID')
    .requiredOption('--source <nodeId>', 'Source node ID')
    .requiredOption('--target <nodeId>', 'Target node ID')
    .option('--type <type>', 'Edge type: dependency | branch', 'dependency')
    .action(async (cmdOpts: { projectId: string; source: string; target: string; type: string }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      const id = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      // Validate source and target exist before creating
      const validationError = await validateNodeIds(client, cmdOpts.projectId, [
        { id: cmdOpts.source, role: '--source' },
        { id: cmdOpts.target, role: '--target' },
      ], opts.json)
      if (validationError) {
        if (opts.json) {
          print({ error: validationError }, { json: true })
        } else {
          console.error(chalk.red(`Validation failed:\n${validationError}`))
        }
        process.exitCode = 1
        return
      }

      try {
        const result = await client.createPlanEdge({ id, projectId: cmdOpts.projectId, source: cmdOpts.source, target: cmdOpts.target, type: cmdOpts.type })

        if (opts.json) {
          print({ ...result, id, source: cmdOpts.source, target: cmdOpts.target }, { json: true })
        } else {
          console.log(chalk.green(`Edge added: ${cmdOpts.source} → ${cmdOpts.target} (${cmdOpts.type})`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (opts.json) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Add edge failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── plan remove-edge ──────────────────────────────────────────────
  plan
    .command('remove-edge')
    .description('Remove a dependency edge between two plan nodes')
    .requiredOption('--project-id <id>', 'Project ID')
    .requiredOption('--source <nodeId>', 'Source node ID')
    .requiredOption('--target <nodeId>', 'Target node ID')
    .action(async (cmdOpts: { projectId: string; source: string; target: string }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      try {
        const { edges } = await client.getPlan(cmdOpts.projectId)
        const edge = edges.find((e: { source: string; target: string }) => e.source === cmdOpts.source && e.target === cmdOpts.target)

        if (!edge) {
          const msg = `No edge found from ${cmdOpts.source} to ${cmdOpts.target}`
          if (opts.json) {
            print({ error: msg }, { json: true })
          } else {
            console.error(chalk.red(msg))
          }
          process.exitCode = 1
          return
        }

        const result = await client.deletePlanEdge((edge as { id: string }).id)

        if (opts.json) {
          print({ ...result, source: cmdOpts.source, target: cmdOpts.target }, { json: true })
        } else {
          console.log(chalk.green(`Edge removed: ${cmdOpts.source} → ${cmdOpts.target}`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (opts.json) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Remove edge failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── plan add-github-push-task ─────────────────────────────────────
  plan
    .command('add-github-push-task')
    .description('Add a pre-configured "Push to GitHub" final task node to the plan')
    .requiredOption('--project-id <id>', 'Project ID')
    .requiredOption('--repo <owner/repo>', 'GitHub repository (e.g. acme/my-app)')
    .requiredOption('--base-branch <branch>', 'Target branch for the PR (e.g. main)')
    .requiredOption('--milestone-id <id>', 'Milestone this task contributes to (the final milestone)')
    .option('--depends-on <nodeId>', 'Node this task depends on (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc }, [] as string[])
    .action(async (cmdOpts: {
      projectId: string
      repo: string
      baseBranch: string
      milestoneId: string
      dependsOn: string[]
    }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      // Validate all referenced node IDs before creating anything
      const idsToValidate = [
        { id: cmdOpts.milestoneId, role: '--milestone-id' },
        ...cmdOpts.dependsOn.map(d => ({ id: d, role: '--depends-on' })),
      ]
      const validationError = await validateNodeIds(client, cmdOpts.projectId, idsToValidate, opts.json)
      if (validationError) {
        if (opts.json) {
          print({ error: validationError }, { json: true })
        } else {
          console.error(chalk.red(`Validation failed:\n${validationError}`))
        }
        process.exitCode = 1
        return
      }

      const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const description =
        `Open a pull request on ${cmdOpts.repo} merging the project branch into \`${cmdOpts.baseBranch}\`. ` +
        `Steps: (1) rebase onto latest ${cmdOpts.baseBranch} and resolve any conflicts, force-pushing with --force-with-lease; ` +
        `(2) create the PR with a comprehensive summary of all completed tasks and key changes; ` +
        `(3) wait for CI checks to pass — if any fail, read the feedback, fix, push, and recheck up to 3 cycles. ` +
        `The task succeeds when all required CI checks pass.`

      try {
        await client.createPlanNode({
          id,
          projectId: cmdOpts.projectId,
          title: 'Push to GitHub',
          type: 'task',
          description,
          status: 'planned',
          parentId: null,
          priority: null,
          milestoneId: cmdOpts.milestoneId,
          dependencies: cmdOpts.dependsOn.length > 0 ? cmdOpts.dependsOn : undefined,
          estimate: 'XS',
          verification: 'auto',
          dueDate: null,
          startDate: null,
          endDate: null,
        })

        // Create dependency edges
        const edgesAdded: string[] = []
        for (const depId of cmdOpts.dependsOn) {
          const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          await client.createPlanEdge({ id: edgeId, projectId: cmdOpts.projectId, source: depId, target: id, type: 'dependency' })
          edgesAdded.push(depId)
        }

        if (opts.json) {
          print({ ok: true, id, edgesAdded }, { json: true })
        } else {
          console.log(chalk.green('GitHub push task created:'))
          console.log(`  ${chalk.bold('ID')}       ${id}`)
          console.log(`  ${chalk.bold('Title')}    Push to GitHub`)
          console.log(`  ${chalk.bold('Repo')}     ${cmdOpts.repo} → ${cmdOpts.baseBranch}`)
          if (edgesAdded.length > 0) {
            console.log(`  ${chalk.bold('Depends')}  ${edgesAdded.join(', ')}`)
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (opts.json) {
          print({ error: msg }, { json: true })
        } else {
          console.error(chalk.red(`Failed: ${msg}`))
        }
        process.exitCode = 1
      }
    })

  // ── plan stats ────────────────────────────────────────────────────
  plan
    .command('stats')
    .description('Show plan statistics for a project')
    .requiredOption('--project-id <id>', 'Project ID')
    .action(async (cmdOpts: { projectId: string }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      try {
        const { nodes, edges } = await client.getPlan(cmdOpts.projectId)
        const active = nodes.filter(n => !n.deletedAt)

        // Status counts
        const statusCounts: Record<string, number> = {}
        for (const n of active) {
          statusCounts[n.status] = (statusCounts[n.status] || 0) + 1
        }

        // Execution coverage
        const withExecution = active.filter(n => n.executionId).length

        // Date range
        const dates = active
          .flatMap(n => [n.startDate, n.endDate].filter(Boolean) as string[])
          .map(d => new Date(d).getTime())
          .filter(d => !isNaN(d))
        const minDate = dates.length > 0 ? new Date(Math.min(...dates)).toISOString().split('T')[0] : null
        const maxDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString().split('T')[0] : null

        const stats = {
          totalNodes: active.length,
          totalEdges: edges.length,
          statusCounts,
          executionCoverage: active.length > 0 ? `${withExecution}/${active.length} (${Math.round(withExecution / active.length * 100)}%)` : '0/0',
          dateRange: minDate && maxDate ? `${minDate} \u2192 ${maxDate}` : '\u2014',
        }

        if (opts.json) {
          print(stats, { json: true })
          return
        }

        console.log()
        console.log(chalk.bold('  Plan Statistics'))
        console.log(chalk.dim('  ' + '\u2500'.repeat(40)))
        console.log(`  ${chalk.dim('Total Nodes:')}       ${stats.totalNodes}`)
        console.log(`  ${chalk.dim('Total Edges:')}       ${stats.totalEdges}`)
        console.log(`  ${chalk.dim('Execution Coverage:')} ${stats.executionCoverage}`)
        console.log(`  ${chalk.dim('Date Range:')}        ${stats.dateRange}`)
        console.log()
        console.log(chalk.bold('  Status Breakdown'))
        for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
          console.log(`    ${formatStatus(status).padEnd(25)} ${count}`)
        }
        console.log()
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
      }
    })

  // ── plan export ───────────────────────────────────────────────────
  plan
    .command('export')
    .description('Export plan in various formats')
    .requiredOption('--project-id <id>', 'Project ID')
    .option('--format <fmt>', 'Output format: json, dot, mermaid', 'json')
    .action(async (cmdOpts: { projectId: string; format: string }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      let nodes, edges
      try {
        const result = await client.getPlan(cmdOpts.projectId)
        nodes = result.nodes.filter(n => !n.deletedAt)
        edges = result.edges
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      switch (cmdOpts.format) {
        case 'json':
          console.log(JSON.stringify({ nodes, edges }, null, 2))
          break

        case 'dot': {
          const lines = ['digraph plan {', '  rankdir=LR;', '  node [shape=box];']
          for (const n of nodes) {
            const label = n.title.replace(/"/g, '\\"')
            lines.push(`  "${n.id}" [label="${label}\\n[${n.status}]"];`)
          }
          for (const e of edges) {
            lines.push(`  "${e.source}" -> "${e.target}";`)
          }
          lines.push('}')
          console.log(lines.join('\n'))
          break
        }

        case 'mermaid': {
          const lines = ['graph LR']
          for (const n of nodes) {
            const label = n.title.replace(/"/g, "'")
            lines.push(`  ${n.id}["${label}<br/>${n.status}"]`)
          }
          for (const e of edges) {
            lines.push(`  ${e.source} --> ${e.target}`)
          }
          console.log(lines.join('\n'))
          break
        }

        default:
          console.error(chalk.red(`Unknown format "${cmdOpts.format}". Use json, dot, or mermaid.`))
          process.exitCode = 1
      }
    })

  // ── plan generate ──────────────────────────────────────────────────
  plan
    .command('generate')
    .description('Generate a plan using AI')
    .requiredOption('--project-id <id>', 'Project ID')
    .requiredOption('--description <desc>', 'Description of what to plan')
    .option('--model <model>', 'AI model to use')
    .option('--provider <provider>', 'Preferred provider ID')
    .option('--machine <id>', 'Target machine ID')
    .option('--yolo', 'Auto-approve all approval requests')
    .action(async (cmdOpts: {
      projectId: string
      description: string
      model?: string
      provider?: string
      machine?: string
      yolo?: boolean
    }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)

      console.log(chalk.dim('Generating plan...'))
      console.log()

      try {
        const response = await client.dispatchTask({
          nodeId: `plan-${cmdOpts.projectId}`,
          projectId: cmdOpts.projectId,
          title: `Interactive planning: ${cmdOpts.description.slice(0, 80)}`,
          isInteractivePlan: true,
          description: cmdOpts.description,
          verification: 'human',
          model: cmdOpts.model,
          preferredProvider: cmdOpts.provider,
          targetMachineId: cmdOpts.machine,
        })

        const approvalHandler = createApprovalHandler(client, !!cmdOpts.yolo)

        await streamDispatchToStdout(response, {
          json: opts.json,
          onApprovalRequest: approvalHandler,
        })
        console.log()
        console.log(chalk.green('Plan generation complete.'))
      } catch (err) {
        console.error(chalk.red(`Plan generation failed: ${err instanceof Error ? err.message : String(err)}`))
        process.exitCode = 1
      }
    })
}
