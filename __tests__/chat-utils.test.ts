/**
 * Unit tests for chat utilities.
 * Tests history file management and approval handler logic.
 * Does NOT require a running server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadHistory, saveHistory, createApprovalHandler, type ChatMessage } from '../src/chat-utils.js'

describe('chat-utils', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'astro-chat-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  // ── loadHistory ─────────────────────────────────────────────────────

  describe('loadHistory', () => {
    it('returns empty array for nonexistent file', () => {
      const result = loadHistory(join(tempDir, 'nonexistent.json'))
      expect(result).toEqual([])
    })

    it('returns empty array for invalid JSON', () => {
      const path = join(tempDir, 'bad.json')
      writeFileSync(path, 'not json at all')
      expect(loadHistory(path)).toEqual([])
    })

    it('returns empty array for non-array JSON', () => {
      const path = join(tempDir, 'obj.json')
      writeFileSync(path, '{"role": "user"}')
      expect(loadHistory(path)).toEqual([])
    })

    it('loads valid message history', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ]
      const path = join(tempDir, 'history.json')
      writeFileSync(path, JSON.stringify(messages))
      expect(loadHistory(path)).toEqual(messages)
    })

    it('truncates to last 100 messages', () => {
      const messages: ChatMessage[] = Array.from({ length: 120 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `message ${i}`,
      }))
      const path = join(tempDir, 'long.json')
      writeFileSync(path, JSON.stringify(messages))

      const loaded = loadHistory(path)
      expect(loaded).toHaveLength(100)
      expect(loaded[0].content).toBe('message 20')
      expect(loaded[99].content).toBe('message 119')
    })
  })

  // ── saveHistory ─────────────────────────────────────────────────────

  describe('saveHistory', () => {
    it('writes messages to file', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: 'response' },
      ]
      const path = join(tempDir, 'save.json')
      saveHistory(path, messages)

      const raw = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed).toEqual(messages)
    })

    it('caps at 100 messages on save', () => {
      const messages: ChatMessage[] = Array.from({ length: 150 }, (_, i) => ({
        role: 'user' as const,
        content: `msg ${i}`,
      }))
      const path = join(tempDir, 'capped.json')
      saveHistory(path, messages)

      const raw = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed).toHaveLength(100)
      expect(parsed[0].content).toBe('msg 50')
    })

    it('roundtrips with loadHistory', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'hello world' },
        { role: 'assistant', content: 'greetings' },
        { role: 'user', content: 'how are you?' },
      ]
      const path = join(tempDir, 'roundtrip.json')
      saveHistory(path, messages)
      expect(loadHistory(path)).toEqual(messages)
    })
  })

  // ── createApprovalHandler ───────────────────────────────────────────

  describe('createApprovalHandler', () => {
    it('yolo mode auto-selects first option', async () => {
      const mockClient = {
        sendApproval: vi.fn().mockResolvedValue({ success: true }),
      }

      const handler = createApprovalHandler(mockClient as any, true)
      const result = await handler({
        requestId: 'req-1',
        question: 'Approve this?',
        options: ['yes', 'no', 'skip'],
        taskId: 'task-1',
        machineId: 'machine-1',
      })

      expect(result).toEqual({ answered: true, answer: 'yes' })
      expect(mockClient.sendApproval).toHaveBeenCalledWith({
        taskId: 'task-1',
        machineId: 'machine-1',
        requestId: 'req-1',
        answered: true,
        answer: 'yes',
      })
    })

    it('yolo mode sends approval to server', async () => {
      const mockClient = {
        sendApproval: vi.fn().mockResolvedValue({ success: true }),
      }

      const handler = createApprovalHandler(mockClient as any, true)
      await handler({
        requestId: 'req-2',
        question: 'Continue?',
        options: ['continue', 'abort'],
        taskId: 'task-2',
        machineId: 'machine-2',
      })

      expect(mockClient.sendApproval).toHaveBeenCalledTimes(1)
      expect(mockClient.sendApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-2',
          answered: true,
          answer: 'continue',
        })
      )
    })

    it('skips sendApproval when taskId/machineId/requestId missing', async () => {
      const mockClient = {
        sendApproval: vi.fn().mockResolvedValue({ success: true }),
      }

      const handler = createApprovalHandler(mockClient as any, true)
      await handler({
        requestId: 'req-3',
        question: 'Approve?',
        options: ['yes'],
        // no taskId or machineId
      })

      expect(mockClient.sendApproval).not.toHaveBeenCalled()
    })

    it('handles sendApproval failure gracefully', async () => {
      const mockClient = {
        sendApproval: vi.fn().mockRejectedValue(new Error('network error')),
      }

      const handler = createApprovalHandler(mockClient as any, true)
      // Should not throw
      const result = await handler({
        requestId: 'req-4',
        question: 'Approve?',
        options: ['ok'],
        taskId: 'task-4',
        machineId: 'machine-4',
      })

      expect(result).toEqual({ answered: true, answer: 'ok' })
    })
  })
})
