/**
 * Unit tests for SSE streaming helpers.
 * Tests parseSSELines, streamDispatchToStdout, streamChatToStdout.
 * Does NOT require a running server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamDispatchToStdout, streamChatToStdout, type StreamResult } from '../src/client.js'

/**
 * Create a mock Response with a readable stream from SSE lines.
 */
function mockSSEResponse(events: Array<Record<string, unknown>>): Response {
  const lines = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('SSE streaming', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>
  let stderrWrite: ReturnType<typeof vi.spyOn>
  let consoleLog: ReturnType<typeof vi.spyOn>
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── streamDispatchToStdout ────────────────────────────────────────

  describe('streamDispatchToStdout', () => {
    it('returns empty result for response with no body', async () => {
      const response = new Response(null)
      const result = await streamDispatchToStdout(response)
      expect(result).toEqual({})
    })

    it('streams text content to stdout', async () => {
      const response = mockSSEResponse([
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: 'world' },
        { type: 'done' },
      ])
      await streamDispatchToStdout(response)

      expect(stdoutWrite).toHaveBeenCalledWith('Hello ')
      expect(stdoutWrite).toHaveBeenCalledWith('world')
    })

    it('captures session_init', async () => {
      const response = mockSSEResponse([
        { type: 'session_init', sessionId: 'sess-123' },
        { type: 'done' },
      ])
      const result = await streamDispatchToStdout(response)
      expect(result.sessionId).toBe('sess-123')
    })

    it('captures metrics from result event', async () => {
      const response = mockSSEResponse([
        { type: 'result', status: 'completed', durationMs: 5000, inputTokens: 100, outputTokens: 200, totalCost: 0.05, model: 'claude-3' },
        { type: 'done' },
      ])
      const result = await streamDispatchToStdout(response)
      expect(result.metrics).toEqual({
        durationMs: 5000,
        inputTokens: 100,
        outputTokens: 200,
        totalCost: 0.05,
        model: 'claude-3',
      })
    })

    it('outputs tool_use events to stderr', async () => {
      const response = mockSSEResponse([
        { type: 'tool_use', name: 'read_file' },
        { type: 'done' },
      ])
      await streamDispatchToStdout(response)
      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('read_file'))
    })

    it('handles plan_result event', async () => {
      const response = mockSSEResponse([
        { type: 'plan_result', plan: { nodes: [], edges: [] } },
        { type: 'done' },
      ])
      await streamDispatchToStdout(response)
      expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Plan Generated'))
    })

    it('calls onApprovalRequest callback', async () => {
      const onApproval = vi.fn().mockResolvedValue({ answered: true, answer: 'yes' })
      const response = mockSSEResponse([
        { type: 'approval_request', requestId: 'r1', question: 'OK?', options: ['yes', 'no'], taskId: 't1', machineId: 'm1' },
        { type: 'done' },
      ])
      await streamDispatchToStdout(response, { onApprovalRequest: onApproval })
      expect(onApproval).toHaveBeenCalledWith({
        requestId: 'r1',
        question: 'OK?',
        options: ['yes', 'no'],
        taskId: 't1',
        machineId: 'm1',
      })
    })

    it('prints approval info to stderr when no callback', async () => {
      const response = mockSSEResponse([
        { type: 'approval_request', question: 'Approve?', options: ['yes', 'no'] },
        { type: 'done' },
      ])
      await streamDispatchToStdout(response)
      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('Approve?'))
    })

    it('outputs error events', async () => {
      const response = mockSSEResponse([
        { type: 'error', message: 'something failed' },
        { type: 'done' },
      ])
      await streamDispatchToStdout(response)
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('something failed'))
    })

    it('json mode outputs raw JSON lines', async () => {
      const events = [
        { type: 'text', content: 'hi' },
        { type: 'done' },
      ]
      const response = mockSSEResponse(events)
      await streamDispatchToStdout(response, { json: true })

      expect(consoleLog).toHaveBeenCalledWith(JSON.stringify({ type: 'text', content: 'hi' }))
      expect(consoleLog).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }))
    })
  })

  // ── streamChatToStdout ────────────────────────────────────────────

  describe('streamChatToStdout', () => {
    it('returns empty result for response with no body', async () => {
      const response = new Response(null)
      const result = await streamChatToStdout(response)
      expect(result).toEqual({})
    })

    it('streams text and accumulates assistantText', async () => {
      const response = mockSSEResponse([
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: 'world' },
        { type: 'done' },
      ])
      const result = await streamChatToStdout(response)

      expect(stdoutWrite).toHaveBeenCalledWith('Hello ')
      expect(stdoutWrite).toHaveBeenCalledWith('world')
      expect(result.assistantText).toBe('Hello world')
    })

    it('captures session_init', async () => {
      const response = mockSSEResponse([
        { type: 'session_init', sessionId: 'chat-sess-1' },
        { type: 'done' },
      ])
      const result = await streamChatToStdout(response)
      expect(result.sessionId).toBe('chat-sess-1')
    })

    it('captures metrics from done event', async () => {
      const response = mockSSEResponse([
        { type: 'text', content: 'hi' },
        { type: 'done', durationMs: 1200, inputTokens: 50, outputTokens: 100, totalCost: 0.01, model: 'claude-4' },
      ])
      const result = await streamChatToStdout(response)
      expect(result.metrics).toEqual({
        durationMs: 1200,
        inputTokens: 50,
        outputTokens: 100,
        totalCost: 0.01,
        model: 'claude-4',
      })
    })

    it('outputs file_change events to stderr', async () => {
      const response = mockSSEResponse([
        { type: 'file_change', action: 'modified', path: 'src/index.ts' },
        { type: 'done' },
      ])
      await streamChatToStdout(response)
      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('src/index.ts'))
      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('modified'))
    })

    it('outputs compaction events to stderr', async () => {
      const response = mockSSEResponse([
        { type: 'compaction', originalCount: 50, compactedCount: 10 },
        { type: 'done' },
      ])
      await streamChatToStdout(response)
      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('compaction'))
      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('50'))
    })

    it('handles approval_request with callback', async () => {
      const onApproval = vi.fn().mockResolvedValue({ answered: true, answer: 'proceed' })
      const response = mockSSEResponse([
        { type: 'approval_request', requestId: 'ar1', question: 'Deploy?', options: ['proceed', 'cancel'], taskId: 't1', machineId: 'm1' },
        { type: 'done' },
      ])
      await streamChatToStdout(response, { onApprovalRequest: onApproval })
      expect(onApproval).toHaveBeenCalledWith(expect.objectContaining({ question: 'Deploy?' }))
    })

    it('returns assistantText even when empty', async () => {
      const response = mockSSEResponse([
        { type: 'done' },
      ])
      const result = await streamChatToStdout(response)
      expect(result.assistantText).toBe('')
    })

    it('json mode outputs raw JSON lines', async () => {
      const response = mockSSEResponse([
        { type: 'text', content: 'hello' },
        { type: 'done' },
      ])
      await streamChatToStdout(response, { json: true })
      expect(consoleLog).toHaveBeenCalledWith(JSON.stringify({ type: 'text', content: 'hello' }))
      // In json mode, assistantText is not accumulated (stdout.write not called)
      expect(stdoutWrite).not.toHaveBeenCalled()
    })
  })
})
