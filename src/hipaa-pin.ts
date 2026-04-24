/**
 * HIPAA pinning — CLI-side.
 *
 * When the user sets `ASTRO_HIPAA_MODE=true` on their host, they're declaring
 * that every command they run must target a HIPAA-mode server. Running such a
 * CLI against a non-HIPAA server would route PHI through the general-purpose
 * deployment, which is outside the BAA.
 *
 * Conversely, a non-HIPAA CLI pointed at a HIPAA server signals a
 * misconfiguration — the server will enforce its own fail-closed posture, but
 * we surface the error up-front with a clear message.
 *
 * We fetch `/api/config` (added in Phase 1) from the resolved server URL and
 * compare its `hipaa` flag against `ASTRO_HIPAA_MODE`.
 */

import { getServerUrl } from './config.js'

function isHipaaEnv(): boolean {
  const v = process.env.ASTRO_HIPAA_MODE
  return v === '1' || v === 'true' || v === 'TRUE'
}

interface ServerConfig {
  hipaa: boolean
  mode?: string
}

async function fetchServerConfig(serverUrl: string): Promise<ServerConfig | null> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/config`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as ServerConfig
    return body
  } catch {
    return null
  }
}

export async function assertHipaaPinning(cliServerOverride?: string): Promise<void> {
  const hostHipaa = isHipaaEnv()
  // Fast path: if the user isn't declaring HIPAA intent, and the server check
  // would fail silently (offline, old server), there's nothing to enforce.
  // But we *do* still want to detect the opposite direction (non-HIPAA CLI
  // against HIPAA server) so we always attempt the fetch.
  const serverUrl = getServerUrl(cliServerOverride)
  const cfg = await fetchServerConfig(serverUrl)

  if (!cfg) {
    // If the user explicitly asked for HIPAA mode and we cannot confirm the
    // server, refuse to proceed. In HIPAA we never fall back.
    if (hostHipaa) {
      throw new Error(
        `ASTRO_HIPAA_MODE=true but could not reach ${serverUrl}/api/config to verify the server is HIPAA mode. ` +
          `Refusing to run — HIPAA deployments must never fall back to non-HIPAA behavior.`,
      )
    }
    return
  }

  if (hostHipaa && !cfg.hipaa) {
    throw new Error(
      `ASTRO_HIPAA_MODE=true on this host, but ${serverUrl}/api/config reports hipaa=false. ` +
        `Refusing to run — this CLI must only talk to a HIPAA-mode server.`,
    )
  }
  if (!hostHipaa && cfg.hipaa) {
    throw new Error(
      `${serverUrl}/api/config reports hipaa=true, but ASTRO_HIPAA_MODE is not set on this host. ` +
        `Refusing to run — set ASTRO_HIPAA_MODE=true to confirm you intend to target a HIPAA server.`,
    )
  }
}
