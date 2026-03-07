/**
 * Input state machine — htop/helm style (non-modal).
 * Replaces vim-modal navigation with always-ready direct interaction.
 *
 * Modes:
 * - 'normal'  — arrow keys navigate, function keys trigger actions
 * - 'palette' — command palette open, typing filters commands
 * - 'search'  — search overlay open, typing filters items
 * - 'input'   — text input active (steer message, chat, etc.)
 */

export type VimMode = 'normal' | 'palette' | 'search' | 'input'

// Keep 'command' as alias for backward compatibility with store references
export type { VimMode as InputMode }

export interface VimState {
  mode: VimMode
  commandBuffer: string
  searchQuery: string
  pendingKeys: string
}

export type VimAction =
  | { type: 'key'; key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }
  | { type: 'set_mode'; mode: VimMode }
  | { type: 'clear_command' }
  | { type: 'clear_search' }
  | { type: 'submit_command' }
  | { type: 'submit_search' }

export interface VimEffect {
  type: 'navigate' | 'scroll' | 'select' | 'focus' | 'command' | 'search' | 'quit' | 'dispatch' | 'cancel' | 'refresh' | 'help' | 'palette' | 'chat' | 'none'
  direction?: 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom' | 'page_up' | 'page_down'
  panel?: number
  value?: string
}

export function initialVimState(): VimState {
  return {
    mode: 'normal',
    commandBuffer: '',
    searchQuery: '',
    pendingKeys: '',
  }
}

export function vimReducer(state: VimState, action: VimAction): [VimState, VimEffect] {
  switch (action.type) {
    case 'set_mode':
      return [{ ...state, mode: action.mode, pendingKeys: '' }, { type: 'none' }]

    case 'clear_command':
      return [{ ...state, commandBuffer: '', mode: 'normal', pendingKeys: '' }, { type: 'none' }]

    case 'clear_search':
      return [{ ...state, searchQuery: '', mode: 'normal', pendingKeys: '' }, { type: 'none' }]

    case 'submit_command':
      return [
        { ...state, mode: 'normal', pendingKeys: '' },
        { type: 'command', value: state.commandBuffer },
      ]

    case 'submit_search':
      return [
        { ...state, mode: 'normal', pendingKeys: '' },
        { type: 'search', value: state.searchQuery },
      ]

    case 'key':
      return handleKey(state, action.key, action.ctrl, action.meta)
  }
}

function handleKey(
  state: VimState,
  key: string,
  ctrl?: boolean,
  meta?: boolean,
): [VimState, VimEffect] {
  // Escape always returns to normal mode
  if (key === 'escape') {
    return [{ ...state, mode: 'normal', pendingKeys: '', commandBuffer: '', searchQuery: '' }, { type: 'none' }]
  }

  switch (state.mode) {
    case 'normal':
      return handleNormalMode(state, key, ctrl, meta)
    case 'palette':
      return handlePaletteMode(state, key)
    case 'search':
      return handleSearchMode(state, key)
    case 'input':
      return handleInputMode(state, key)
  }
}

function handleNormalMode(
  state: VimState,
  key: string,
  ctrl?: boolean,
  meta?: boolean,
): [VimState, VimEffect] {
  // ── Ctrl combos (tmux-safe: avoid Ctrl+b, Ctrl+a) ──
  if (ctrl) {
    switch (key) {
      case 'p': return [{ ...state, mode: 'palette', commandBuffer: '' }, { type: 'palette' }]
      case 'f': return [{ ...state, mode: 'search', searchQuery: '' }, { type: 'none' }]
      case 'c': return [state, { type: 'quit' }]
      case 'r': return [state, { type: 'refresh' }]
      default: return [state, { type: 'none' }]
    }
  }

  // ── Meta/Alt combos ──
  if (meta) {
    switch (key) {
      case 'x': return [{ ...state, mode: 'palette', commandBuffer: '' }, { type: 'palette' }]
      default: return [state, { type: 'none' }]
    }
  }

  // ── Direct keys (always-active, no mode switching needed) ──
  switch (key) {
    // Arrow navigation (primary — no j/k needed)
    case 'up': return [state, { type: 'scroll', direction: 'up' }]
    case 'down': return [state, { type: 'scroll', direction: 'down' }]
    case 'left': return [state, { type: 'focus', direction: 'left' }]
    case 'right': return [state, { type: 'focus', direction: 'right' }]

    // Also keep j/k/h/l as secondary navigation for power users
    case 'j': return [state, { type: 'scroll', direction: 'down' }]
    case 'k': return [state, { type: 'scroll', direction: 'up' }]
    case 'h': return [state, { type: 'focus', direction: 'left' }]
    case 'l': return [state, { type: 'focus', direction: 'right' }]

    // Selection
    case 'return': return [state, { type: 'select' }]
    case ' ': return [state, { type: 'select' }]

    // Page navigation
    case 'pageup': return [state, { type: 'scroll', direction: 'page_up' }]
    case 'pagedown': return [state, { type: 'scroll', direction: 'page_down' }]
    case 'home': return [state, { type: 'scroll', direction: 'top' }]
    case 'end': return [state, { type: 'scroll', direction: 'bottom' }]

    // Tab cycles panels
    case 'tab': return [state, { type: 'focus', direction: 'right' }]

    // Panel jump by number
    case '1': return [state, { type: 'focus', panel: 0 }]
    case '2': return [state, { type: 'focus', panel: 1 }]
    case '3': return [state, { type: 'focus', panel: 2 }]
    case '4': return [state, { type: 'focus', panel: 3 }]
    case '5': return [state, { type: 'focus', panel: 4 }]

    // Function-key style shortcuts (single letter, no prefix needed)
    case 'q': return [state, { type: 'quit' }]
    case '?': return [state, { type: 'help' }]
    case '/': return [{ ...state, mode: 'search', searchQuery: '' }, { type: 'none' }]

    // Legacy `:` still works — enters palette mode
    case ':': return [{ ...state, mode: 'palette', commandBuffer: '' }, { type: 'palette' }]

    default:
      return [state, { type: 'none' }]
  }
}

function handlePaletteMode(state: VimState, key: string): [VimState, VimEffect] {
  if (key === 'return') {
    return [
      { ...state, mode: 'normal' },
      { type: 'command', value: state.commandBuffer },
    ]
  }
  if (key === 'backspace' || key === 'delete') {
    const newBuffer = state.commandBuffer.slice(0, -1)
    if (newBuffer.length === 0) {
      return [{ ...state, mode: 'normal', commandBuffer: '' }, { type: 'none' }]
    }
    return [{ ...state, commandBuffer: newBuffer }, { type: 'none' }]
  }
  if (key === 'tab') {
    return [state, { type: 'command', value: `__autocomplete__${state.commandBuffer}` }]
  }
  if (key.length === 1) {
    return [{ ...state, commandBuffer: state.commandBuffer + key }, { type: 'none' }]
  }
  return [state, { type: 'none' }]
}

function handleSearchMode(state: VimState, key: string): [VimState, VimEffect] {
  if (key === 'return') {
    return [
      { ...state, mode: 'normal' },
      { type: 'search', value: state.searchQuery },
    ]
  }
  if (key === 'backspace' || key === 'delete') {
    const newQuery = state.searchQuery.slice(0, -1)
    if (newQuery.length === 0) {
      return [{ ...state, mode: 'normal', searchQuery: '' }, { type: 'none' }]
    }
    return [{ ...state, searchQuery: newQuery }, { type: 'search', value: newQuery }]
  }
  if (key.length === 1) {
    const newQuery = state.searchQuery + key
    return [{ ...state, searchQuery: newQuery }, { type: 'search', value: newQuery }]
  }
  return [state, { type: 'none' }]
}

function handleInputMode(state: VimState, _: string): [VimState, VimEffect] {
  // Input mode passes all keys through — handled by the component
  return [state, { type: 'none' }]
}
