/**
 * Fuzzy filter for the command palette.
 * Filters PALETTE_COMMANDS + dynamic session entries by matching
 * the query against name and description.
 */
import { PALETTE_COMMANDS, type PaletteCommand } from './handlers.js'
import { useExecutionStore } from '../stores/execution-store.js'

/** Build dynamic "resume" entries from the execution store */
function getResumeCommands(): PaletteCommand[] {
  const outputs = useExecutionStore.getState().outputs
  const entries: PaletteCommand[] = []

  for (const [id, exec] of outputs) {
    const statusLabel = exec.status === 'running' ? '\u25B6' : exec.status === 'success' || exec.status === 'completed' ? '\u2713' : '\u00B7'
    entries.push({
      name: `resume ${exec.title}`,
      description: `${statusLabel} ${exec.status} — switch to this session`,
      usage: `resume:${id}`,
    })
  }

  // Sort: running first, then by startedAt descending
  entries.sort((a, b) => {
    const aExec = outputs.get(a.usage!.replace('resume:', ''))
    const bExec = outputs.get(b.usage!.replace('resume:', ''))
    if (aExec?.status === 'running' && bExec?.status !== 'running') return -1
    if (bExec?.status === 'running' && aExec?.status !== 'running') return 1
    const ta = aExec?.startedAt ? new Date(aExec.startedAt).getTime() : 0
    const tb = bExec?.startedAt ? new Date(bExec.startedAt).getTime() : 0
    return tb - ta
  })

  return entries
}

export function getFilteredPaletteCommands(query: string): PaletteCommand[] {
  const resumeCommands = getResumeCommands()
  const allCommands = [...PALETTE_COMMANDS, ...resumeCommands]

  if (!query) return allCommands

  const lower = query.toLowerCase()
  return allCommands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower),
  )
}
