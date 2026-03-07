import React, { useMemo, useCallback } from 'react'
import { MainLayout } from './components/layout/main-layout.js'
import { AstroClient } from '../client.js'
import { useVimMode } from './hooks/use-vim-mode.js'
import { usePolling } from './hooks/use-polling.js'
import { useSSEStream } from './hooks/use-sse-stream.js'
import { useFuzzySearch } from './hooks/use-fuzzy-search.js'
import { useCommandParser } from './hooks/use-command-parser.js'
import { useTuiStore } from './stores/tui-store.js'
import { useProjectsStore } from './stores/projects-store.js'
import { usePlanStore } from './stores/plan-store.js'
import { useSearchStore } from './stores/search-store.js'
import { useExecutionStore } from './stores/execution-store.js'
import { useChatStore } from './stores/chat-store.js'

interface AppProps {
  serverUrl?: string
}

export function App({ serverUrl }: AppProps) {
  const client = useMemo(() => new AstroClient({ serverUrl }), [serverUrl])

  // Data loading
  const { refreshAll } = usePolling(client)

  // SSE streaming — refresh data on reconnect to pick up browser changes
  useSSEStream(client, refreshAll)

  // Fuzzy search
  useFuzzySearch()

  // Command parser
  const { execute } = useCommandParser(client)

  // Selection handlers
  const onSelect = useCallback(() => {
    const { focusedPanel, scrollIndex } = useTuiStore.getState()

    switch (focusedPanel) {
      case 'projects': {
        const projects = useProjectsStore.getState().projects
        const idx = scrollIndex.projects
        if (projects[idx]) {
          useTuiStore.getState().setSelectedProject(projects[idx].id)
        }
        break
      }
      case 'plan': {
        const nodes = usePlanStore.getState().nodes.filter((n) => !n.deletedAt)
        const idx = scrollIndex.plan
        const node = nodes[idx]
        if (node) {
          useTuiStore.getState().setSelectedNode(node.id)
          useTuiStore.getState().openDetail('node', node.id)
        }
        break
      }
      case 'machines': {
        break
      }
    }
  }, [])

  const onCommand = useCallback(
    (cmd: string) => {
      execute(cmd)
    },
    [execute],
  )

  const onSearch = useCallback(
    (query: string) => {
      useSearchStore.getState().setQuery(query)
      if (query.length > 0) {
        useSearchStore.getState().open()
      }
    },
    [],
  )

  const onDispatch = useCallback(async () => {
    const { focusedPanel, scrollIndex, selectedProjectId } = useTuiStore.getState()

    // If focused on the plan panel, dispatch the highlighted node
    if (focusedPanel === 'plan') {
      const nodes = usePlanStore.getState().nodes.filter((n) => !n.deletedAt)
      const node = nodes[scrollIndex.plan]
      if (node && selectedProjectId) {
        useTuiStore.getState().setSelectedNode(node.id)
        await execute(`dispatch ${node.id}`)
        return
      }
    }

    // Fallback: dispatch selected node
    const nodeId = useTuiStore.getState().selectedNodeId
    const projectId = useTuiStore.getState().selectedProjectId
    if (nodeId && projectId) {
      await execute(`dispatch ${nodeId}`)
    }
  }, [execute])

  const onCancel = useCallback(async () => {
    await execute('cancel')
  }, [execute])

  const onRefresh = useCallback(() => {
    refreshAll()
  }, [refreshAll])

  // Handle messages from the session panel (playground/plan-generate views)
  const onSessionMessage = useCallback(async (message: string) => {
    const { selectedProjectId, activeView, selectedNodeId } = useTuiStore.getState()
    if (!selectedProjectId) {
      useTuiStore.getState().setLastError('No project selected')
      return
    }

    const watchingId = useExecutionStore.getState().watchingId

    // If no active execution, start a new one via dispatch
    if (!watchingId) {
      if (activeView === 'plan-gen') {
        await execute(`plan generate ${message}`)
      } else {
        await execute(`playground ${message}`)
      }
      return
    }

    // Otherwise, send follow-up via chat command
    // Use task chat if a task node is selected, otherwise project chat
    if (selectedNodeId) {
      await execute(`task chat ${message}`)
    } else {
      await execute(`project chat ${message}`)
    }
  }, [execute])

  // Vim mode
  useVimMode({
    onSelect,
    onCommand,
    onSearch,
    onDispatch,
    onCancel,
    onRefresh,
  })

  return <MainLayout onSessionMessage={onSessionMessage} />
}
