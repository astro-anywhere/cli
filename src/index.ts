import { createRequire } from 'module'
import { Command } from 'commander'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }
import { registerProjectCommands } from './commands/project.js'
import { registerPlanCommands } from './commands/plan.js'
import { registerTaskCommands } from './commands/task.js'
import { registerSearchCommands } from './commands/search.js'
import { registerActivityCommands } from './commands/activity.js'
import { registerTraceCommands } from './commands/trace.js'
import { registerEnvCommands } from './commands/env.js'
import { registerConfigCommands } from './commands/config.js'
import { registerAuthCommands } from './commands/auth.js'
import { registerCompletionCommands } from './commands/completion.js'
import { registerPlaygroundCommands } from './commands/playground.js'
import { registerReferenceCommands } from './commands/reference.js'

const program = new Command()

program
  .name('astro-cli')
  .description('CLI for managing Astro projects, plans, tasks, and environments')
  .version(version)
  .option('--json', 'Machine-readable JSON output')
  .option('--quiet', 'Suppress spinners and decorative output')
  .option('--server-url <url>', 'Override server URL')

registerProjectCommands(program)
registerPlanCommands(program)
registerTaskCommands(program)
registerSearchCommands(program)
registerActivityCommands(program)
registerTraceCommands(program)
registerEnvCommands(program)
registerConfigCommands(program)
registerAuthCommands(program)
registerCompletionCommands(program)
registerPlaygroundCommands(program)
registerReferenceCommands(program)

program
  .command('tui')
  .description('Launch interactive terminal UI')
  .action(async () => {
    const { launchTui } = await import('./tui/index.js')
    await launchTui(program.opts().serverUrl)
  })

program.parse()
