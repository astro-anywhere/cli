import { create } from 'zustand'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export interface ChatState {
  messages: ChatMessage[]
  sessionId: string | null
  projectId: string | null
  nodeId: string | null
  streaming: boolean
  streamBuffer: string
}

export interface ChatActions {
  addMessage: (role: ChatMessage['role'], content: string) => void
  appendStream: (text: string) => void
  flushStream: () => void
  setSessionId: (id: string | null) => void
  setContext: (projectId: string | null, nodeId?: string | null) => void
  setStreaming: (streaming: boolean) => void
  clear: () => void
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  messages: [],
  sessionId: null,
  projectId: null,
  nodeId: null,
  streaming: false,
  streamBuffer: '',

  addMessage: (role, content) => {
    set((s) => ({
      messages: [...s.messages, { role, content, timestamp: new Date().toISOString() }],
    }))
  },

  appendStream: (text) => {
    set((s) => ({ streamBuffer: s.streamBuffer + text }))
  },

  flushStream: () => {
    const { streamBuffer } = get()
    if (streamBuffer.length > 0) {
      set((s) => ({
        messages: [...s.messages, { role: 'assistant', content: streamBuffer, timestamp: new Date().toISOString() }],
        streamBuffer: '',
      }))
    }
  },

  setSessionId: (sessionId) => set({ sessionId }),

  setContext: (projectId, nodeId) => set({ projectId, nodeId: nodeId ?? null }),

  setStreaming: (streaming) => set({ streaming }),

  clear: () => set({ messages: [], sessionId: null, streamBuffer: '', streaming: false }),
}))
