/**
 * E2E tests for new CLI commands (chat, plan generate, playground, slurm).
 * Validates command registration, flag parsing, and help text.
 * Server-dependent tests auto-skip when localhost:3001 is unavailable.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process'
import { join } from 'node:path'
import { checkServer } from './setup.js'

let serverAvailable = false
const CLI = join(import.meta.dirname, '..', 'src', 'index.ts')
const SERVER_URL = 'http://localhost:3001'

const execOpts: ExecSyncOptionsWithStringEncoding = {
  encoding: 'utf-8',
  timeout: 15000,
  env: {
    ...process.env,
    ASTRO_SERVER_URL: SERVER_URL,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  },
}

function cli(args: string): string {
  return execSync(`npx tsx ${CLI} ${args}`, execOpts).trim()
}

function cliResult(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx ${CLI} ${args}`, { ...execOpts, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    return { stdout, stderr: '', exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { stdout: (e.stdout ?? '').trim(), stderr: (e.stderr ?? '').trim(), exitCode: e.status ?? 1 }
  }
}

beforeAll(async () => {
  serverAvailable = await checkServer()
})

describe('New CLI commands', () => {
  // ── Help text registration ──────────────────────────────────────────

  describe('command registration', () => {
    it('top-level help includes playground', () => {
      const output = cli('--help')
      expect(output).toContain('playground')
    })

    it('project --help includes chat subcommand', () => {
      const output = cli('project --help')
      expect(output).toContain('chat')
    })

    it('task --help includes chat subcommand', () => {
      const output = cli('task --help')
      expect(output).toContain('chat')
    })

    it('plan --help includes generate subcommand', () => {
      const output = cli('plan --help')
      expect(output).toContain('generate')
    })

    it('playground --help shows start subcommand', () => {
      const output = cli('playground --help')
      expect(output).toContain('start')
    })
  })

  // ── project chat ──────────────────────────────────────────────────

  describe('project chat', () => {
    it('project chat --help shows options', () => {
      const output = cli('project chat --help')
      expect(output).toContain('--message')
      expect(output).toContain('--session-id')
      expect(output).toContain('--model')
      expect(output).toContain('--provider')
      expect(output).toContain('--history-file')
      expect(output).toContain('--yolo')
    })

    it('project chat without --message fails', () => {
      if (!serverAvailable) return
      const result = cliResult('project chat some-id')
      // Should fail either because no message or no project
      expect(result.exitCode).not.toBe(0)
    })
  })

  // ── task chat ─────────────────────────────────────────────────────

  describe('task chat', () => {
    it('task chat --help shows options', () => {
      const output = cli('task chat --help')
      expect(output).toContain('--project-id')
      expect(output).toContain('--message')
      expect(output).toContain('--session-id')
      expect(output).toContain('--model')
      expect(output).toContain('--provider')
      expect(output).toContain('--history-file')
      expect(output).toContain('--yolo')
    })

    it('task chat requires --project-id', () => {
      const result = cliResult('task chat some-node --message "hi"')
      expect(result.exitCode).not.toBe(0)
    })
  })

  // ── task dispatch flags ───────────────────────────────────────────

  describe('task dispatch flags', () => {
    it('task dispatch --help shows new flags', () => {
      const output = cli('task dispatch --help')
      expect(output).toContain('--yolo')
      expect(output).toContain('--model')
      expect(output).toContain('--provider')
      expect(output).toContain('--machine')
    })

    it('task dispatch --help shows slurm flags', () => {
      const output = cli('task dispatch --help')
      expect(output).toContain('--slurm')
      expect(output).toContain('--slurm-partition')
      expect(output).toContain('--slurm-gpus')
      expect(output).toContain('--slurm-gpu-type')
      expect(output).toContain('--slurm-mem')
      expect(output).toContain('--slurm-time')
    })
  })

  // ── task watch flags ──────────────────────────────────────────────

  describe('task watch flags', () => {
    it('task watch --help shows --yolo flag', () => {
      const output = cli('task watch --help')
      expect(output).toContain('--yolo')
    })
  })

  // ── plan generate ─────────────────────────────────────────────────

  describe('plan generate', () => {
    it('plan generate --help shows options', () => {
      const output = cli('plan generate --help')
      expect(output).toContain('--project-id')
      expect(output).toContain('--description')
      expect(output).toContain('--model')
      expect(output).toContain('--provider')
      expect(output).toContain('--machine')
      expect(output).toContain('--yolo')
    })

    it('plan generate requires --project-id', () => {
      const result = cliResult('plan generate --description "test"')
      expect(result.exitCode).not.toBe(0)
    })

    it('plan generate requires --description', () => {
      const result = cliResult('plan generate --project-id some-id')
      expect(result.exitCode).not.toBe(0)
    })
  })

  // ── playground ────────────────────────────────────────────────────

  describe('playground', () => {
    it('playground start --help shows options', () => {
      const output = cli('playground start --help')
      expect(output).toContain('--project-id')
      expect(output).toContain('--description')
      expect(output).toContain('--dir')
      expect(output).toContain('--model')
      expect(output).toContain('--provider')
      expect(output).toContain('--machine')
      expect(output).toContain('--yolo')
    })

    it('playground start requires --project-id', () => {
      const result = cliResult('playground start --description "test"')
      expect(result.exitCode).not.toBe(0)
    })

    it('playground start requires --description', () => {
      const result = cliResult('playground start --project-id some-id')
      expect(result.exitCode).not.toBe(0)
    })
  })
})
