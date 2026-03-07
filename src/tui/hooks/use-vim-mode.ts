/**
 * Hook that connects Ink's useInput to the input state machine.
 * Dispatches effects to TUI store actions.
 *
 * Keybinding design: htop/helm-style, tmux & vscode terminal compatible.
 * - Arrow keys always navigate (no modal j/k requirement)
 * - Ctrl+P opens command palette (like vscode; safe in tmux)
 * - Ctrl+F opens search (safe in tmux; vscode uses it for find)
 * - Tab cycles panels
 * - No Ctrl+B (tmux prefix), no Ctrl+A (tmux/screen prefix)
 */
import { useCallback, useRef } from 'react'
import { useInput, useApp } from 'ink'
import { initialVimState, vimReducer, type VimState, type VimEffect } from '../lib/vim-state-machine.js'
import { useTuiStore } from '../stores/tui-store.js'
import { getFilteredPaletteCommands } from '../commands/palette-filter.js'

export interface VimModeCallbacks {
  onCommand?: (command: string) => void
  onSearch?: (query: string) => void
  onSelect?: () => void
  onDispatch?: () => void
  onCancel?: () => void
  onRefresh?: () => void
}

export function useVimMode(callbacks: VimModeCallbacks = {}) {
  const { exit } = useApp()
  const vimState = useRef<VimState>(initialVimState())

  const store = useTuiStore()

  const handleEffect = useCallback(
    (effect: VimEffect) => {
      switch (effect.type) {
        case 'scroll':
          // In palette mode, scroll navigates the palette list
          if (vimState.current.mode === 'palette') {
            const filtered = getFilteredPaletteCommands(vimState.current.commandBuffer)
            const idx = store.paletteIndex
            if (effect.direction === 'up') {
              store.setPaletteIndex(Math.max(0, idx - 1))
            } else if (effect.direction === 'down') {
              store.setPaletteIndex(Math.min(filtered.length - 1, idx + 1))
            }
            break
          }
          switch (effect.direction) {
            case 'up': store.scrollUp(); break
            case 'down': store.scrollDown(); break
            case 'top': store.scrollToTop(); break
            case 'bottom': store.scrollToBottom(); break
            case 'page_up': store.pageUp(); break
            case 'page_down': store.pageDown(); break
          }
          break

        case 'focus':
          if (effect.panel != null) {
            store.focusByIndex(effect.panel)
          } else if (effect.direction === 'left') {
            store.focusPrev()
          } else if (effect.direction === 'right') {
            store.focusNext()
          }
          break

        case 'select': {
          const view = store.activeView
          // In session views, Enter activates input mode
          if (view === 'playground' || view === 'output') {
            vimState.current = { ...vimState.current, mode: 'input' }
            store.setMode('input')
          } else {
            callbacks.onSelect?.()
          }
          break
        }

        case 'palette':
          // Palette open is handled by mode change — no extra action needed
          break

        case 'command':
          if (effect.value === '__palette_select__') {
            // Select the highlighted palette command
            const filtered = getFilteredPaletteCommands(vimState.current.commandBuffer)
            const selected = filtered[store.paletteIndex]
            if (selected) {
              callbacks.onCommand?.(selected.name)
            }
          } else if (effect.value?.startsWith('__autocomplete__')) {
            // Autocomplete handled by command-line component
          } else if (effect.value) {
            callbacks.onCommand?.(effect.value)
          }
          break

        case 'search':
          if (effect.value) {
            callbacks.onSearch?.(effect.value)
          }
          break

        case 'dispatch':
          callbacks.onDispatch?.()
          break

        case 'cancel':
          callbacks.onCancel?.()
          break

        case 'refresh':
          callbacks.onRefresh?.()
          break

        case 'quit':
          exit()
          setTimeout(() => process.exit(0), 100)
          break

        case 'help':
          store.toggleHelp()
          break

        case 'chat':
          store.toggleChat()
          break

        case 'view':
          if (effect.value === 'dashboard' || effect.value === 'projects' || effect.value === 'playground' || effect.value === 'output') {
            store.setActiveView(effect.value)
          }
          break

        case 'none':
          break
      }
    },
    [store, callbacks, exit],
  )

  useInput((input, key) => {
    // Don't handle input when overlays are open (except Escape)
    if (store.showHelp || store.showSearch || store.showDetail) {
      if (key.escape) {
        store.closeOverlays()
        vimState.current = initialVimState()
        store.setMode('normal')
        store.setCommandBuffer('')
        store.setSearchQuery('')
        store.setPendingKeys('')
      }
      return
    }

    // Map Ink key events to our key string format
    // Arrow keys use named strings so the state machine can distinguish them
    let keyStr = input
    if (key.escape) keyStr = 'escape'
    else if (key.return) keyStr = 'return'
    else if (key.backspace || key.delete) keyStr = 'backspace'
    else if (key.tab) keyStr = 'tab'
    else if (key.upArrow) keyStr = 'up'
    else if (key.downArrow) keyStr = 'down'
    else if (key.leftArrow) keyStr = 'left'
    else if (key.rightArrow) keyStr = 'right'
    else if (key.pageUp) keyStr = 'pageup'
    else if (key.pageDown) keyStr = 'pagedown'
    else if (key.home) keyStr = 'home'
    else if (key.end) keyStr = 'end'

    const [nextState, effect] = vimReducer(vimState.current, {
      type: 'key',
      key: keyStr,
      ctrl: key.ctrl,
      shift: key.shift,
      meta: key.meta,
    })

    vimState.current = nextState

    // Sync to store
    store.setMode(nextState.mode)
    store.setCommandBuffer(nextState.commandBuffer)
    store.setSearchQuery(nextState.searchQuery)
    store.setPendingKeys(nextState.pendingKeys)

    handleEffect(effect)
  })
}
