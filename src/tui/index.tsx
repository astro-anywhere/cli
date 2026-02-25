/**
 * TUI entry point — launched via `astro-cli tui`.
 */
import React from 'react'
import { render } from 'ink'
import { App } from './app.js'

export async function launchTui(serverUrl?: string) {
  render(<App serverUrl={serverUrl} />, {
    exitOnCtrlC: true,
  })
}
