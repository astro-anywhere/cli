/**
 * Unit tests for the htop-style input state machine.
 * Pure functions — no server, no DOM, no mocking needed.
 */
import { describe, it, expect } from 'vitest'
import { initialVimState, vimReducer, type VimState, type VimMode } from '../src/tui/lib/vim-state-machine.js'

function key(k: string, opts?: { ctrl?: boolean; meta?: boolean; shift?: boolean }) {
  return { type: 'key' as const, key: k, ...opts }
}

function stateIn(mode: VimMode, overrides?: Partial<VimState>): VimState {
  return { ...initialVimState(), mode, ...overrides }
}

describe('vim-state-machine', () => {
  // ── Initial state ─────────────────────────────────────────────────

  describe('initialVimState', () => {
    it('starts in normal mode with empty buffers', () => {
      const s = initialVimState()
      expect(s.mode).toBe('normal')
      expect(s.commandBuffer).toBe('')
      expect(s.searchQuery).toBe('')
      expect(s.pendingKeys).toBe('')
    })
  })

  // ── Normal mode: arrow key navigation ─────────────────────────────

  describe('normal mode — arrow keys', () => {
    it('up arrow scrolls up', () => {
      const [s, e] = vimReducer(initialVimState(), key('up'))
      expect(e).toEqual({ type: 'scroll', direction: 'up' })
      expect(s.mode).toBe('normal')
    })

    it('down arrow scrolls down', () => {
      const [, e] = vimReducer(initialVimState(), key('down'))
      expect(e).toEqual({ type: 'scroll', direction: 'down' })
    })

    it('left arrow focuses left panel', () => {
      const [, e] = vimReducer(initialVimState(), key('left'))
      expect(e).toEqual({ type: 'focus', direction: 'left' })
    })

    it('right arrow focuses right panel', () => {
      const [, e] = vimReducer(initialVimState(), key('right'))
      expect(e).toEqual({ type: 'focus', direction: 'right' })
    })
  })

  // ── Normal mode: vim secondary navigation ─────────────────────────

  describe('normal mode — vim keys (secondary)', () => {
    it('j scrolls down', () => {
      const [, e] = vimReducer(initialVimState(), key('j'))
      expect(e).toEqual({ type: 'scroll', direction: 'down' })
    })

    it('k scrolls up', () => {
      const [, e] = vimReducer(initialVimState(), key('k'))
      expect(e).toEqual({ type: 'scroll', direction: 'up' })
    })

    it('h focuses left', () => {
      const [, e] = vimReducer(initialVimState(), key('h'))
      expect(e).toEqual({ type: 'focus', direction: 'left' })
    })

    it('l focuses right', () => {
      const [, e] = vimReducer(initialVimState(), key('l'))
      expect(e).toEqual({ type: 'focus', direction: 'right' })
    })
  })

  // ── Normal mode: selection ────────────────────────────────────────

  describe('normal mode — selection', () => {
    it('Enter selects', () => {
      const [, e] = vimReducer(initialVimState(), key('return'))
      expect(e).toEqual({ type: 'select' })
    })

    it('Space selects', () => {
      const [, e] = vimReducer(initialVimState(), key(' '))
      expect(e).toEqual({ type: 'select' })
    })
  })

  // ── Normal mode: page navigation ──────────────────────────────────

  describe('normal mode — page navigation', () => {
    it('pageup scrolls page up', () => {
      const [, e] = vimReducer(initialVimState(), key('pageup'))
      expect(e).toEqual({ type: 'scroll', direction: 'page_up' })
    })

    it('pagedown scrolls page down', () => {
      const [, e] = vimReducer(initialVimState(), key('pagedown'))
      expect(e).toEqual({ type: 'scroll', direction: 'page_down' })
    })

    it('home scrolls to top', () => {
      const [, e] = vimReducer(initialVimState(), key('home'))
      expect(e).toEqual({ type: 'scroll', direction: 'top' })
    })

    it('end scrolls to bottom', () => {
      const [, e] = vimReducer(initialVimState(), key('end'))
      expect(e).toEqual({ type: 'scroll', direction: 'bottom' })
    })
  })

  // ── Normal mode: panel focus ──────────────────────────────────────

  describe('normal mode — panel focus', () => {
    it('Tab cycles panels right', () => {
      const [, e] = vimReducer(initialVimState(), key('tab'))
      expect(e).toEqual({ type: 'focus', direction: 'right' })
    })

    it.each([
      ['1', 'dashboard'], ['2', 'plan-gen'], ['3', 'projects'], ['4', 'playground'], ['5', 'output'],
    ])('number key %s switches to view %s', (k, view) => {
      const [, e] = vimReducer(initialVimState(), key(k))
      expect(e).toEqual({ type: 'view', value: view })
    })
  })

  // ── Normal mode: shortcuts ────────────────────────────────────────

  describe('normal mode — shortcuts', () => {
    it('q quits', () => {
      const [, e] = vimReducer(initialVimState(), key('q'))
      expect(e).toEqual({ type: 'quit' })
    })

    it('? toggles help', () => {
      const [, e] = vimReducer(initialVimState(), key('?'))
      expect(e).toEqual({ type: 'help' })
    })

    it('/ enters search mode', () => {
      const [s, e] = vimReducer(initialVimState(), key('/'))
      expect(s.mode).toBe('search')
      expect(s.searchQuery).toBe('')
      expect(e.type).toBe('none')
    })

    it(': enters palette mode (legacy)', () => {
      const [s, e] = vimReducer(initialVimState(), key(':'))
      expect(s.mode).toBe('palette')
      expect(s.commandBuffer).toBe('')
      expect(e.type).toBe('palette')
    })
  })

  // ── Normal mode: Ctrl combos ──────────────────────────────────────

  describe('normal mode — Ctrl combos', () => {
    it('Ctrl+P opens palette', () => {
      const [s, e] = vimReducer(initialVimState(), key('p', { ctrl: true }))
      expect(s.mode).toBe('palette')
      expect(s.commandBuffer).toBe('')
      expect(e.type).toBe('palette')
    })

    it('Ctrl+F opens search', () => {
      const [s, e] = vimReducer(initialVimState(), key('f', { ctrl: true }))
      expect(s.mode).toBe('search')
      expect(s.searchQuery).toBe('')
    })

    it('Ctrl+C quits', () => {
      const [, e] = vimReducer(initialVimState(), key('c', { ctrl: true }))
      expect(e).toEqual({ type: 'quit' })
    })

    it('Ctrl+R refreshes', () => {
      const [, e] = vimReducer(initialVimState(), key('r', { ctrl: true }))
      expect(e).toEqual({ type: 'refresh' })
    })

    it('Ctrl+B is not captured (tmux prefix)', () => {
      const [, e] = vimReducer(initialVimState(), key('b', { ctrl: true }))
      expect(e).toEqual({ type: 'none' })
    })

    it('Ctrl+A is not captured (screen prefix)', () => {
      const [, e] = vimReducer(initialVimState(), key('a', { ctrl: true }))
      expect(e).toEqual({ type: 'none' })
    })
  })

  // ── Normal mode: Meta/Alt combos ──────────────────────────────────

  describe('normal mode — Meta/Alt combos', () => {
    it('Alt+X opens palette', () => {
      const [s, e] = vimReducer(initialVimState(), key('x', { meta: true }))
      expect(s.mode).toBe('palette')
      expect(e.type).toBe('palette')
    })

    it('other Alt combos are ignored', () => {
      const [, e] = vimReducer(initialVimState(), key('z', { meta: true }))
      expect(e.type).toBe('none')
    })
  })

  // ── Normal mode: unknown keys ─────────────────────────────────────

  describe('normal mode — unknown keys', () => {
    it('unbound keys produce no effect', () => {
      const [s, e] = vimReducer(initialVimState(), key('z'))
      expect(s.mode).toBe('normal')
      expect(e.type).toBe('none')
    })
  })

  // ── Escape from any mode ──────────────────────────────────────────

  describe('escape', () => {
    it.each(['normal', 'palette', 'search', 'input'] as VimMode[])('escape from %s returns to normal', (mode) => {
      const s = stateIn(mode, { commandBuffer: 'test', searchQuery: 'query' })
      const [next, e] = vimReducer(s, key('escape'))
      expect(next.mode).toBe('normal')
      expect(next.commandBuffer).toBe('')
      expect(next.searchQuery).toBe('')
      expect(next.pendingKeys).toBe('')
      expect(e.type).toBe('none')
    })
  })

  // ── Palette mode ──────────────────────────────────────────────────

  describe('palette mode', () => {
    it('typing appends to command buffer', () => {
      let state = stateIn('palette')
      const [s1] = vimReducer(state, key('h'))
      expect(s1.commandBuffer).toBe('h')
      const [s2] = vimReducer(s1, key('e'))
      expect(s2.commandBuffer).toBe('he')
      const [s3] = vimReducer(s2, key('l'))
      expect(s3.commandBuffer).toBe('hel')
    })

    it('Enter always sends palette select signal regardless of buffer', () => {
      const state = stateIn('palette', { commandBuffer: 'quit' })
      const [s, e] = vimReducer(state, key('return'))
      expect(s.mode).toBe('normal')
      expect(e).toEqual({ type: 'command', value: '__palette_select__' })
    })

    it('Enter on empty buffer sends palette select signal', () => {
      const state = stateIn('palette', { commandBuffer: '' })
      const [s, e] = vimReducer(state, key('return'))
      expect(s.mode).toBe('normal')
      expect(e).toEqual({ type: 'command', value: '__palette_select__' })
    })

    it('backspace deletes last char', () => {
      const state = stateIn('palette', { commandBuffer: 'abc' })
      const [s] = vimReducer(state, key('backspace'))
      expect(s.commandBuffer).toBe('ab')
      expect(s.mode).toBe('palette')
    })

    it('backspace on single char exits palette', () => {
      const state = stateIn('palette', { commandBuffer: 'x' })
      const [s] = vimReducer(state, key('backspace'))
      expect(s.mode).toBe('normal')
      expect(s.commandBuffer).toBe('')
    })

    it('Tab navigates down in palette list', () => {
      const state = stateIn('palette', { commandBuffer: 'pro' })
      const [, e] = vimReducer(state, key('tab'))
      expect(e).toEqual({ type: 'scroll', direction: 'down' })
    })

    it('up/down arrows navigate palette list', () => {
      const state = stateIn('palette', { commandBuffer: 'ab' })
      const [s1, e1] = vimReducer(state, key('up'))
      expect(s1.commandBuffer).toBe('ab')
      expect(e1).toEqual({ type: 'scroll', direction: 'up' })

      const [s2, e2] = vimReducer(state, key('down'))
      expect(s2.commandBuffer).toBe('ab')
      expect(e2).toEqual({ type: 'scroll', direction: 'down' })
    })
  })

  // ── Search mode ───────────────────────────────────────────────────

  describe('search mode', () => {
    it('typing appends to search query and emits live search', () => {
      let state = stateIn('search')
      const [s1, e1] = vimReducer(state, key('f'))
      expect(s1.searchQuery).toBe('f')
      expect(e1).toEqual({ type: 'search', value: 'f' })

      const [s2, e2] = vimReducer(s1, key('o'))
      expect(s2.searchQuery).toBe('fo')
      expect(e2).toEqual({ type: 'search', value: 'fo' })
    })

    it('Enter submits search and returns to normal', () => {
      const state = stateIn('search', { searchQuery: 'test' })
      const [s, e] = vimReducer(state, key('return'))
      expect(s.mode).toBe('normal')
      expect(e).toEqual({ type: 'search', value: 'test' })
    })

    it('backspace deletes last char and emits live search', () => {
      const state = stateIn('search', { searchQuery: 'abc' })
      const [s, e] = vimReducer(state, key('backspace'))
      expect(s.searchQuery).toBe('ab')
      expect(e).toEqual({ type: 'search', value: 'ab' })
    })

    it('backspace on single char exits search', () => {
      const state = stateIn('search', { searchQuery: 'x' })
      const [s, e] = vimReducer(state, key('backspace'))
      expect(s.mode).toBe('normal')
      expect(s.searchQuery).toBe('')
      expect(e.type).toBe('none')
    })
  })

  // ── Input mode ────────────────────────────────────────────────────

  describe('input mode', () => {
    it('passes all keys through (no effect)', () => {
      const state = stateIn('input')
      const [s, e] = vimReducer(state, key('a'))
      expect(s.mode).toBe('input')
      expect(e.type).toBe('none')
    })

    it('escape exits input mode', () => {
      const state = stateIn('input')
      const [s] = vimReducer(state, key('escape'))
      expect(s.mode).toBe('normal')
    })
  })

  // ── Action-based transitions ──────────────────────────────────────

  describe('action-based transitions', () => {
    it('set_mode changes mode', () => {
      const [s, e] = vimReducer(initialVimState(), { type: 'set_mode', mode: 'input' })
      expect(s.mode).toBe('input')
      expect(e.type).toBe('none')
    })

    it('clear_command resets buffer and returns to normal', () => {
      const state = stateIn('palette', { commandBuffer: 'test' })
      const [s, e] = vimReducer(state, { type: 'clear_command' })
      expect(s.mode).toBe('normal')
      expect(s.commandBuffer).toBe('')
      expect(e.type).toBe('none')
    })

    it('clear_search resets query and returns to normal', () => {
      const state = stateIn('search', { searchQuery: 'test' })
      const [s, e] = vimReducer(state, { type: 'clear_search' })
      expect(s.mode).toBe('normal')
      expect(s.searchQuery).toBe('')
      expect(e.type).toBe('none')
    })

    it('submit_command emits command with buffer value', () => {
      const state = stateIn('palette', { commandBuffer: 'refresh' })
      const [s, e] = vimReducer(state, { type: 'submit_command' })
      expect(s.mode).toBe('normal')
      expect(e).toEqual({ type: 'command', value: 'refresh' })
    })

    it('submit_search emits search with query value', () => {
      const state = stateIn('search', { searchQuery: 'hello' })
      const [s, e] = vimReducer(state, { type: 'submit_search' })
      expect(s.mode).toBe('normal')
      expect(e).toEqual({ type: 'search', value: 'hello' })
    })
  })

  // ── Full interaction sequences ────────────────────────────────────

  describe('interaction sequences', () => {
    it('Ctrl+P → type "quit" → Enter sends palette select signal', () => {
      let state = initialVimState()
      let effect

      ;[state, effect] = vimReducer(state, key('p', { ctrl: true }))
      expect(state.mode).toBe('palette')

      ;[state] = vimReducer(state, key('q'))
      ;[state] = vimReducer(state, key('u'))
      ;[state] = vimReducer(state, key('i'))
      ;[state] = vimReducer(state, key('t'))
      expect(state.commandBuffer).toBe('quit')

      ;[state, effect] = vimReducer(state, key('return'))
      expect(state.mode).toBe('normal')
      // Always resolves via paletteIndex in the hook, not raw buffer
      expect(effect).toEqual({ type: 'command', value: '__palette_select__' })
    })

    it('/ → type "node" → Enter performs search', () => {
      let state = initialVimState()
      let effect

      ;[state] = vimReducer(state, key('/'))
      expect(state.mode).toBe('search')

      ;[state, effect] = vimReducer(state, key('n'))
      expect(effect).toEqual({ type: 'search', value: 'n' })

      ;[state] = vimReducer(state, key('o'))
      ;[state] = vimReducer(state, key('d'))
      ;[state] = vimReducer(state, key('e'))

      ;[state, effect] = vimReducer(state, key('return'))
      expect(state.mode).toBe('normal')
      expect(effect).toEqual({ type: 'search', value: 'node' })
    })

    it('palette → type → Escape cancels without submitting', () => {
      let state = initialVimState()

      ;[state] = vimReducer(state, key(':'))
      ;[state] = vimReducer(state, key('a'))
      ;[state] = vimReducer(state, key('b'))
      expect(state.commandBuffer).toBe('ab')

      const [next, effect] = vimReducer(state, key('escape'))
      expect(next.mode).toBe('normal')
      expect(next.commandBuffer).toBe('')
      expect(effect.type).toBe('none')
    })
  })
})
