/**
 * Formatting utilities for the TUI.
 * Ported from packages/cli/src/output.ts (no chalk — Ink handles colors).
 */

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '\u2014'
  const d = typeof date === 'string' ? new Date(date) : date
  const now = Date.now()
  const diff = now - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return '\u2014'
  return `$${usd.toFixed(2)}`
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '\u2026'
}

export function getShortId(id: string): string {
  const normalized = id.replace(/-/g, '').toLowerCase()
  if (/^[0-9a-f]{32}$/.test(normalized)) {
    return normalized.slice(0, 6)
  }

  const tail = id.toLowerCase().split('-').filter(Boolean).at(-1)
  if (tail && tail.length >= 4) {
    return tail.slice(-6)
  }

  return normalized.slice(0, 6)
}

export function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length)
}

/**
 * Get the visible project list: filter out playground projects, sort by updatedAt descending.
 * Shared between projects-panel, app onSelect, and vim-mode auto-select.
 */
export function getVisibleProjects<T extends { updatedAt: string; projectType?: string | null; [k: string]: unknown }>(projects: T[]): T[] {
  return projects
    .filter((p) => p.projectType !== 'playground')
    .sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return tb - ta
    })
}
