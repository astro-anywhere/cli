import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import type { AstroClient, ApprovalRequest } from './client.js'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_HISTORY_MESSAGES = 100

export function loadHistory(path: string): ChatMessage[] {
  try {
    const raw = readFileSync(path, 'utf-8')
    const messages = JSON.parse(raw) as ChatMessage[]
    if (!Array.isArray(messages)) return []
    return messages.slice(-MAX_HISTORY_MESSAGES)
  } catch {
    return []
  }
}

export function saveHistory(path: string, messages: ChatMessage[]): void {
  writeFileSync(path, JSON.stringify(messages.slice(-MAX_HISTORY_MESSAGES), null, 2))
}

/**
 * Prompt the user for an approval selection on stderr (keeps stdout clean for piping).
 */
async function promptApproval(question: string, options: string[]): Promise<{ answered: boolean; answer?: string }> {
  process.stderr.write(`\n${question}\n`)
  for (let i = 0; i < options.length; i++) {
    process.stderr.write(`  [${i + 1}] ${options[i]}\n`)
  }
  process.stderr.write('Select option (number): ')

  const rl = createInterface({ input: process.stdin, output: process.stderr })

  return new Promise((resolve) => {
    rl.question('', (input) => {
      rl.close()
      const idx = parseInt(input.trim(), 10) - 1
      if (idx >= 0 && idx < options.length) {
        resolve({ answered: true, answer: options[idx] })
      } else {
        resolve({ answered: false })
      }
    })
  })
}

/**
 * Create an approval handler for SSE streams.
 * In yolo mode, auto-selects the first option.
 * Otherwise, prompts the user interactively.
 */
export function createApprovalHandler(
  client: AstroClient,
  yolo: boolean,
): (data: ApprovalRequest) => Promise<{ answered: boolean; answer?: string }> {
  return async (data: ApprovalRequest) => {
    let result: { answered: boolean; answer?: string }

    if (yolo) {
      result = { answered: true, answer: data.options[0] }
      process.stderr.write(`\n[yolo] Auto-approved: ${data.question} → ${data.options[0]}\n`)
    } else {
      result = await promptApproval(data.question, data.options)
    }

    // Send approval response to server
    if (data.taskId && data.machineId && data.requestId) {
      try {
        await client.sendApproval({
          taskId: data.taskId,
          machineId: data.machineId,
          requestId: data.requestId,
          answered: result.answered,
          answer: result.answer,
        })
      } catch (err) {
        process.stderr.write(`[approval] Failed to send: ${err instanceof Error ? err.message : String(err)}\n`)
      }
    }

    return result
  }
}
