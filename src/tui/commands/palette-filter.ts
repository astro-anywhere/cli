/**
 * Fuzzy filter for the command palette.
 * Filters PALETTE_COMMANDS by matching the query against name and description.
 */
import { PALETTE_COMMANDS, type PaletteCommand } from './handlers.js'

export function getFilteredPaletteCommands(query: string): PaletteCommand[] {
  if (!query) return PALETTE_COMMANDS

  const lower = query.toLowerCase()
  return PALETTE_COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower),
  )
}
