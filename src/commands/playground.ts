import type { Command } from 'commander'
import { getClient, streamDispatchToStdout } from '../client.js'
import { createApprovalHandler } from '../chat-utils.js'
import chalk from 'chalk'

export function registerPlaygroundCommands(program: Command): void {
  const playground = program.command('playground').description('Run ephemeral AI executions')

  playground
    .command('start')
    .description('Start a playground execution')
    .requiredOption('--project-id <id>', 'Project ID')
    .requiredOption('--description <desc>', 'What to execute')
    .option('--dir <path>', 'Working directory override')
    .option('--model <model>', 'AI model to use')
    .option('--provider <provider>', 'Preferred provider ID')
    .option('--machine <id>', 'Target machine ID')
    .option('--yolo', 'Auto-approve all approval requests')
    .action(async (cmdOpts: {
      projectId: string
      description: string
      dir?: string
      model?: string
      provider?: string
      machine?: string
      yolo?: boolean
    }) => {
      const opts = program.opts()
      const client = getClient(opts.serverUrl)
      const nodeId = `playground-${cmdOpts.projectId}-${Date.now()}`

      console.log(chalk.dim(`Starting playground execution ${chalk.bold(nodeId)}...`))
      console.log()

      try {
        const response = await client.dispatchTask({
          nodeId,
          projectId: cmdOpts.projectId,
          skipSafetyCheck: true,
          description: cmdOpts.description,
          title: 'Playground execution',
          model: cmdOpts.model,
          preferredProvider: cmdOpts.provider,
          targetMachineId: cmdOpts.machine,
          ...(cmdOpts.dir ? { workingDirectory: cmdOpts.dir } : {}),
        })

        const approvalHandler = createApprovalHandler(client, !!cmdOpts.yolo)

        await streamDispatchToStdout(response, {
          json: opts.json,
          onApprovalRequest: approvalHandler,
        })

        console.log()
        console.log(chalk.green('Playground execution complete.'))
        console.log(chalk.dim(`For follow-up: astro-cli task chat ${nodeId} --project-id ${cmdOpts.projectId} --message "..."`))
      } catch (err) {
        console.error(chalk.red(`Playground failed: ${err instanceof Error ? err.message : String(err)}`))
        process.exitCode = 1
      }
    })
}
