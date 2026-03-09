import React from 'react'
import { Box, useStdout } from 'ink'
import { StatusBar } from './status-bar.js'
import { CommandLine } from './command-line.js'
import { HelpOverlay } from './help-overlay.js'
import { SearchOverlay } from './search-overlay.js'
import { ProjectsPanel } from '../panels/projects-panel.js'
import { PlanPanel } from '../panels/plan-panel.js'
import { MachinesPanel } from '../panels/machines-panel.js'
import { OutputPanel } from '../panels/output-panel.js'
import { ChatPanel } from '../panels/chat-panel.js'
import { SessionPanel } from '../panels/session-panel.js'
import { ActiveListPanel } from '../panels/active-list-panel.js'
import { DetailOverlay } from '../panels/detail-overlay.js'
import { ApprovalDialog } from '../shared/approval-dialog.js'
import { ApprovalOverlay } from './approval-overlay.js'
import { useTuiStore } from '../../stores/tui-store.js'
import { useSearchStore } from '../../stores/search-store.js'
import { useExecutionStore } from '../../stores/execution-store.js'

interface MainLayoutProps {
  onSessionMessage?: (message: string) => void
}

export function MainLayout({ onSessionMessage }: MainLayoutProps) {
  const showHelp = useTuiStore((s) => s.showHelp)
  const showDetail = useTuiStore((s) => s.showDetail)
  const showChat = useTuiStore((s) => s.showChat)
  const activeView = useTuiStore((s) => s.activeView)
  const mode = useTuiStore((s) => s.mode)
  const searchOpen = useSearchStore((s) => s.isOpen)
  const pendingApproval = useExecutionStore((s) => s.pendingApproval)
  const showApproval = useTuiStore((s) => s.showApproval)
  const { stdout } = useStdout()

  const termHeight = stdout?.rows ?? 24
  const termWidth = stdout?.columns ?? 80

  // When search or palette is open, bottom panel takes half the screen
  const panelOpen = searchOpen || mode === 'palette'
  const bottomPanelHeight = panelOpen ? Math.floor(termHeight / 2) : 1
  const contentHeight = termHeight - 2 - bottomPanelHeight // 1 for status bar, 1 for spacing

  // Full-screen overlays
  if (showHelp) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight}>
        <StatusBar />
        <HelpOverlay />
        <CommandLine height={1} />
      </Box>
    )
  }

  if (showDetail) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight}>
        <StatusBar />
        <DetailOverlay />
        <CommandLine height={1} />
      </Box>
    )
  }

  // Approval dialog overlay — only show the legacy inline dialog when the
  // new queued ApprovalOverlay is NOT active (avoids dual-render confusion).
  const approvalOverlay = (pendingApproval && !showApproval) ? (
    <Box position="absolute" marginTop={4} marginLeft={Math.floor(termWidth / 4)}>
      <ApprovalDialog
        question={pendingApproval.question}
        options={pendingApproval.options}
        onSelect={(index) => {
          useExecutionStore.getState().setPendingApproval(null)
          void index
        }}
        onDismiss={() => {
          useExecutionStore.getState().setPendingApproval(null)
        }}
      />
    </Box>
  ) : null

  // View-specific content
  let content: React.ReactNode

  if (activeView === 'plan-gen') {
    content = (
      <Box flexDirection="row" height={contentHeight}>
        <Box flexGrow={1}>
          <SessionPanel height={contentHeight} title="PLAN GENERATION" sessionType="plan-generate" onSubmit={onSessionMessage} />
        </Box>
      </Box>
    )
  } else if (activeView === 'projects') {
    content = (
      <Box flexDirection="row" height={contentHeight}>
        <Box width="40%">
          <ProjectsPanel height={contentHeight} />
        </Box>
        <Box flexGrow={1}>
          <PlanPanel height={contentHeight} />
        </Box>
      </Box>
    )
  } else if (activeView === 'playground') {
    content = (
      <Box flexDirection="row" height={contentHeight}>
        <Box flexGrow={1}>
          <SessionPanel height={contentHeight} title="PLAYGROUND" sessionType="playground" onSubmit={onSessionMessage} />
        </Box>
      </Box>
    )
  } else if (activeView === 'active') {
    content = (
      <Box flexDirection="row" height={contentHeight}>
        <Box width="25%">
          <ActiveListPanel height={contentHeight} />
        </Box>
        <Box flexGrow={1}>
          <OutputPanel height={contentHeight} />
        </Box>
      </Box>
    )
  } else {
    // Dashboard (default)
    const topRowHeight = Math.floor(contentHeight / 2)
    const bottomRowHeight = contentHeight - topRowHeight

    content = (
      <>
        <Box flexDirection="row" height={topRowHeight}>
          <Box width="30%">
            <ProjectsPanel height={topRowHeight} />
          </Box>
          <Box flexGrow={1}>
            <PlanPanel height={topRowHeight} />
          </Box>
        </Box>

        <Box flexDirection="row" height={bottomRowHeight}>
          <Box width="30%">
            <MachinesPanel height={bottomRowHeight} />
          </Box>
          <Box flexGrow={1}>
            {showChat ? (
              <ChatPanel height={bottomRowHeight} />
            ) : (
              <OutputPanel height={bottomRowHeight} />
            )}
          </Box>
        </Box>
      </>
    )
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <StatusBar />
      {content}
      <SearchOverlay />
      {approvalOverlay}
      {showApproval && <ApprovalOverlay />}
      <CommandLine height={bottomPanelHeight} />
    </Box>
  )
}
