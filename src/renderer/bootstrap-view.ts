/**
 * Bootstrap View — macOS first-launch loading screen.
 * Shows animated progress while main process runs silent bootstrap.
 * Handles Docker missing modal and architecture error modals.
 */

import type { BootstrapEvent } from '../shared/types'
import { navigateToOnboarding } from './router'

const STAGE_LABELS: Record<string, string> = {
  'arch-check': 'Checking system architecture',
  'nemoclaw-check': 'Checking for NemoClaw',
  'nemoclaw-install': 'Installing NemoClaw',
  'docker-check': 'Checking for Docker',
  'docker-waiting': 'Waiting for Docker Desktop',
  'ollama-check': 'Checking for Ollama',
  'ollama-install': 'Installing Ollama',
  'ollama-serve': 'Starting Ollama service',
  'model-check': 'Checking for llama3.1:8b model',
  'model-pull': 'Downloading llama3.1:8b model',
  'sandbox-create': 'Creating sandbox',
  'complete': 'Bootstrap complete',
  'error': 'Error'
}

export function renderBootstrapView(container: HTMLElement): void {
  container.innerHTML = `
    <div class="oc-bootstrap">
      <div class="oc-window-chrome">
        <div class="oc-traffic-lights">
          <div class="oc-tl oc-tl-red"></div>
          <div class="oc-tl oc-tl-yellow"></div>
          <div class="oc-tl oc-tl-green"></div>
        </div>
        <div class="oc-window-title">open-coot — Setting up</div>
        <div style="width:52px;"></div>
      </div>

      <div class="oc-bootstrap-body">
        <div class="oc-bootstrap-card">
          <div class="oc-bootstrap-logo">
            <div class="oc-logo-mark">OC</div>
            <div class="oc-logo-text">
              <span class="oc-logo-name">open-coot</span>
              <span class="oc-logo-badge">powered by nemoclaw</span>
            </div>
          </div>

          <h2 class="oc-bootstrap-heading">Setting up your AI workspace</h2>
          <p class="oc-bootstrap-sub">We're installing everything you need. This will only take a moment.</p>

          <div class="oc-bootstrap-progress-wrap">
            <div class="oc-bootstrap-progress-bar">
              <div id="oc-bootstrap-fill" class="oc-bootstrap-progress-fill" style="width:0%"></div>
            </div>
            <span id="oc-bootstrap-percent" class="oc-bootstrap-percent">0%</span>
          </div>

          <div id="oc-bootstrap-stage" class="oc-bootstrap-stage">Preparing...</div>

          <div id="oc-bootstrap-steps" class="oc-bootstrap-steps">
            <div class="oc-bs-step" data-stage="arch-check"><span class="oc-bs-dot"></span> System architecture</div>
            <div class="oc-bs-step" data-stage="nemoclaw"><span class="oc-bs-dot"></span> NemoClaw CLI</div>
            <div class="oc-bs-step" data-stage="docker"><span class="oc-bs-dot"></span> Docker Desktop</div>
            <div class="oc-bs-step" data-stage="ollama"><span class="oc-bs-dot"></span> Ollama</div>
            <div class="oc-bs-step" data-stage="model"><span class="oc-bs-dot"></span> llama3.1:8b model</div>
            <div class="oc-bs-step" data-stage="sandbox"><span class="oc-bs-dot"></span> Sandbox environment</div>
          </div>
        </div>
      </div>

      <!-- Docker Missing Modal -->
      <div id="oc-docker-modal" class="oc-modal-overlay" style="display:none">
        <div class="oc-modal">
          <div class="oc-modal-icon">🐳</div>
          <h3 class="oc-modal-title">Docker Required</h3>
          <p class="oc-modal-message">OpenCoot needs Docker Desktop to run secure AI agents.<br>Please install Docker Desktop and launch it.</p>
          <div class="oc-modal-buttons">
            <button id="oc-docker-install-btn" class="oc-btn-primary">Install Docker</button>
            <button id="oc-docker-retry-btn" class="oc-btn-secondary">Retry</button>
          </div>
          <p id="oc-docker-retry-status" class="oc-modal-status" style="display:none">Checking for Docker...</p>
        </div>
      </div>

      <!-- Architecture Error Modal -->
      <div id="oc-arch-modal" class="oc-modal-overlay" style="display:none">
        <div class="oc-modal">
          <div class="oc-modal-icon">⚠️</div>
          <h3 class="oc-modal-title">Unsupported System</h3>
          <p id="oc-arch-message" class="oc-modal-message"></p>
          <div class="oc-modal-buttons">
            <button id="oc-arch-close-btn" class="oc-btn-secondary">Close</button>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div id="oc-bootstrap-error" class="oc-bootstrap-error" style="display:none">
        <div class="oc-error-icon">✕</div>
        <p id="oc-error-message" class="oc-error-message"></p>
        <button id="oc-error-retry-btn" class="oc-btn-primary">Retry</button>
      </div>
    </div>
  `

  setupListeners(container)
}

function setupListeners(container: HTMLElement): void {
  const fillEl = document.getElementById('oc-bootstrap-fill')!
  const percentEl = document.getElementById('oc-bootstrap-percent')!
  const stageEl = document.getElementById('oc-bootstrap-stage')!
  const dockerModal = document.getElementById('oc-docker-modal')!
  const archModal = document.getElementById('oc-arch-modal')!

  // Map stages to step elements
  const stageToStep: Record<string, string> = {
    'arch-check': 'arch-check',
    'nemoclaw-check': 'nemoclaw', 'nemoclaw-install': 'nemoclaw',
    'docker-check': 'docker', 'docker-waiting': 'docker',
    'ollama-check': 'ollama', 'ollama-install': 'ollama', 'ollama-serve': 'ollama',
    'model-check': 'model', 'model-pull': 'model',
    'sandbox-create': 'sandbox'
  }

  // Bootstrap progress
  window.electronAPI.onBootstrapProgress((event: BootstrapEvent) => {
    fillEl.style.width = `${event.progress}%`
    percentEl.textContent = `${event.progress}%`
    stageEl.textContent = event.message

    // Update step dots
    const stepKey = stageToStep[event.stage]
    if (stepKey) {
      const stepEl = document.querySelector(`.oc-bs-step[data-stage="${stepKey}"]`)
      if (stepEl) {
        stepEl.classList.remove('oc-bs-running', 'oc-bs-done', 'oc-bs-error')
        if (event.status === 'running') stepEl.classList.add('oc-bs-running')
        else if (event.status === 'done' || event.status === 'skipped') stepEl.classList.add('oc-bs-done')
        else if (event.status === 'error') stepEl.classList.add('oc-bs-error')
      }
    }
  })

  // Docker missing
  window.electronAPI.onDockerMissing(() => {
    dockerModal.style.display = 'flex'
  })

  document.getElementById('oc-docker-install-btn')!.addEventListener('click', () => {
    window.electronAPI.openDockerDownload()
    const retryStatus = document.getElementById('oc-docker-retry-status')!
    retryStatus.style.display = 'block'
    retryStatus.textContent = 'Waiting for Docker Desktop... (checking every 5s)'
  })

  document.getElementById('oc-docker-retry-btn')!.addEventListener('click', () => {
    const retryStatus = document.getElementById('oc-docker-retry-status')!
    retryStatus.style.display = 'block'
    retryStatus.textContent = 'Checking for Docker...'
    // The main process is already polling every 5s in waitForDockerRetry
    // When Docker is found, it will send 'docker-check' done event which hides the modal
  })

  // Hide docker modal when docker becomes available
  window.electronAPI.onBootstrapProgress((event: BootstrapEvent) => {
    if (event.stage === 'docker-check' && event.status === 'done') {
      dockerModal.style.display = 'none'
    }
  })

  // Arch unsupported
  window.electronAPI.onArchUnsupported((message: string) => {
    archModal.style.display = 'flex'
    document.getElementById('oc-arch-message')!.textContent = message
  })

  document.getElementById('oc-arch-close-btn')!.addEventListener('click', () => {
    window.electronAPI.closeWindow()
  })

  // Bootstrap complete
  window.electronAPI.onBootstrapComplete((success: boolean) => {
    window.electronAPI.removeBootstrapListeners()

    if (success) {
      // Transition to onboarding with a short delay
      setTimeout(() => {
        navigateToOnboarding()
      }, 800)
    } else {
      // Show error state
      const errorDiv = document.getElementById('oc-bootstrap-error')!
      errorDiv.style.display = 'flex'

      const lastStage = stageEl.textContent || 'Unknown error'
      document.getElementById('oc-error-message')!.textContent = lastStage

      document.getElementById('oc-error-retry-btn')!.addEventListener('click', () => {
        // Reload the app to retry bootstrap
        window.location.reload()
      })
    }
  })
}
