/**
 * Router — Decides which UI flow to show based on platform and config state.
 *
 * macOS (darwin):
 *   First launch  → Bootstrap loading screen → Loads OpenClaw via Main Process
 *   Return launch → Simple Loading screen → Loads OpenClaw via Main Process
 *
 * Windows / Linux:
 *   Always → Existing 6-step wizard installer (app.ts)
 */

import type { AppConfig } from '../shared/types'

// Dynamic imports to avoid loading unnecessary code per platform
let wizardLoaded = false

export async function initRouter(): Promise<void> {
  const platform = window.electronAPI.getPlatform()

  if (platform !== 'darwin') {
    // Windows / Linux: load existing wizard
    loadWizardInstaller()
    return
  }

  // macOS: check config
  const config = await window.electronAPI.getConfig()

  if (config && config.setupComplete) {
    // Return launch — main process will handle starting/polling OpenClaw
    hideLegacyUI()
    const root = getOcRoot()
    root.innerHTML = `
      <div style="display:flex; height:100vh; width:100vw; align-items:center; justify-content:center; color:white; font-family: Inter, sans-serif; background:#0a0a0a; flex-direction:column;">
        <div class="oc-spinner" style="margin-bottom:16px;"></div>
        <div style="color:var(--oc-text-muted); font-size:14px;">Waking up OpenClaw...</div>
      </div>
    `
  } else {
    // First launch — show bootstrap screen, main process will send events
    hideLegacyUI()
    const { renderBootstrapView } = await import('./bootstrap-view')
    renderBootstrapView(getOcRoot())
  }
}

function hideLegacyUI(): void {
  const app = document.getElementById('app')
  if (app) app.style.display = 'none'

  const ocRoot = getOcRoot()
  ocRoot.style.display = 'flex'
}

function showLegacyUI(): void {
  const app = document.getElementById('app')
  if (app) app.style.display = 'flex'

  const ocRoot = getOcRoot()
  ocRoot.style.display = 'none'
}

function getOcRoot(): HTMLElement {
  let root = document.getElementById('oc-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'oc-root'
    document.body.appendChild(root)
  }
  return root
}

function loadWizardInstaller(): void {
  if (wizardLoaded) return
  wizardLoaded = true
  showLegacyUI()
  // app.ts auto-initializes on DOMContentLoaded, which has already fired.
  // The import triggers its side effect (new NemoClawWizard).
  import('./app')
}

// ── Navigation helpers (legacy) ─────────────────────────────────────────────

export async function navigateToOnboarding(): Promise<void> {
  // Deprecated: Main process loads OpenClaw directly
}

export async function navigateToDashboard(config?: AppConfig | null): Promise<void> {
  // Deprecated: Main process loads OpenClaw directly
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initRouter()
})
