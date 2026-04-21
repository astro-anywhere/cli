import type { Command } from 'commander'
import chalk from 'chalk'
import fs from 'node:fs'
import { getClient } from '../client.js'
import type { Reference } from '../client.js'
import { print, type ColumnDef } from '../output.js'

export function registerReferenceCommands(program: Command): void {
  const ref = program
    .command('reference')
    .alias('ref')
    .description('Manage the team reference library')

  // ── reference list ────────────────────────────────────────────────

  ref
    .command('list')
    .description('List all references in the team library')
    .option('--project <id>', 'Filter to references cited in project')
    .action(async (cmdOpts: { project?: string }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      let refs: Reference[]
      try {
        refs = await client.listReferences(cmdOpts.project)
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      if (isJson) {
        print(refs, { json: true })
        return
      }

      if (refs.length === 0) {
        console.log(chalk.dim('No references in library.'))
        return
      }

      const cols: ColumnDef[] = [
        { key: 'id', label: 'CITE KEY', width: 20 },
        { key: 'year', label: 'YEAR', width: 6 },
        { key: 'authors', label: 'FIRST AUTHOR', width: 25, format: (v) => {
          const authors = v as string[] | undefined
          return authors?.[0]?.split(',')[0] ?? ''
        }},
        { key: 'title', label: 'TITLE', width: 50 },
        { key: 'venue', label: 'VENUE', width: 30 },
      ]
      print(refs as unknown as Record<string, unknown>[], { columns: cols })
    })

  // ── reference search ──────────────────────────────────────────────

  ref
    .command('search <query>')
    .description('Search the reference library by title, author, year, venue, or cite key')
    .option('--project <id>', 'Restrict to a project\'s cited references')
    .option('--limit <n>', 'Max results (default 20)')
    .action(async (query: string, cmdOpts: { project?: string; limit?: string }) => {
      const client = getClient(program.opts().serverUrl)
      const isJson = program.opts().json

      let refs: Reference[]
      try {
        refs = await client.searchReferences(query, cmdOpts.project)
        if (cmdOpts.limit) refs = refs.slice(0, parseInt(cmdOpts.limit, 10))
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      if (isJson) {
        print(refs.map(r => ({
          citeKey: r.id,
          title: r.title,
          authors: r.authors,
          year: r.year,
          venue: r.venue,
          doi: r.doi,
        })), { json: true })
        return
      }

      if (refs.length === 0) {
        console.log(chalk.dim(`No references matching "${query}"`))
        return
      }

      const cols: ColumnDef[] = [
        { key: 'id', label: 'CITE KEY', width: 20 },
        { key: 'year', label: 'YEAR', width: 6 },
        { key: 'authors', label: 'AUTHOR', width: 25, format: (v) => {
          const authors = v as string[] | undefined
          const first = authors?.[0]?.split(',')[0] ?? ''
          return authors && authors.length > 1 ? `${first} et al.` : first
        }},
        { key: 'title', label: 'TITLE', width: 55 },
      ]
      print(refs as unknown as Record<string, unknown>[], { columns: cols })
    })

  // ── reference export ──────────────────────────────────────────────

  ref
    .command('export')
    .description('Export references as BibTeX')
    .option('--project <id>', 'Export only references cited in this project')
    .option('--output <file>', 'Write to file instead of stdout')
    .action(async (cmdOpts: { project?: string; output?: string }) => {
      const client = getClient(program.opts().serverUrl)

      let bibtex: string
      try {
        bibtex = await client.exportBibTeX(cmdOpts.project)
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      if (cmdOpts.output) {
        fs.writeFileSync(cmdOpts.output, bibtex, 'utf8')
        const count = (bibtex.match(/@\w+\{/g) ?? []).length
        console.log(chalk.green(`✓ Exported ${count} reference${count === 1 ? '' : 's'} to ${cmdOpts.output}`))
      } else {
        process.stdout.write(bibtex)
      }
    })

  // ── reference import ──────────────────────────────────────────────

  ref
    .command('import <file>')
    .description('Import references from a .bib file (goes to inbox by default; use --accept to add directly to library)')
    .option('--project <id>', 'Associate import with a project (stored for review context)')
    .option('--accept', 'Add directly to library, skipping the inbox')
    .action(async (file: string, cmdOpts: { project?: string; accept?: boolean }) => {
      const client = getClient(program.opts().serverUrl)

      let content: string
      try {
        content = fs.readFileSync(file, 'utf8')
      } catch (err) {
        console.error(chalk.red(`Cannot read file: ${(err as Error).message}`))
        process.exitCode = 1
        return
      }

      let result: { imported: number; updated: number }
      try {
        result = await client.importReferencesFromBibTeX(content, {
          projectId: cmdOpts.project,
          accept: cmdOpts.accept,
        })
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exitCode = 1
        return
      }

      const destination = cmdOpts.accept ? 'library' : 'inbox (pending review)'
      console.log(
        chalk.green(`✓ Imported ${result.imported} new, updated ${result.updated} existing references → ${destination}`)
      )
    })
}
