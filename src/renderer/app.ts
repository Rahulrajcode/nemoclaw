import type {
  SystemCheckResponse,
  InstallConfig,
  InstallOutputEvent,
  InstallCompleteEvent
} from '../shared/types'

enum Step {
  Welcome = 0,
  SystemCheck = 1,
  Provider = 2,
  Sandbox = 3,
  Install = 4,
  Complete = 5
}

interface ProviderOption {
  id: 'nvidia' | 'openai' | 'anthropic' | 'gemini' | 'ollama'
  name: string
  desc: string
  badge?: string
  keyUrl: string
  model: string
  noApiKey?: boolean
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'ollama',
    name: 'Local Ollama',
    desc: 'Use pre-installed Ollama for local inference — no API key needed',
    badge: 'Pre-installed',
    keyUrl: '',
    model: 'llama3.1:8b', // llama3.1 supports tool calling needed for OpenClaw agents
    noApiKey: true
  },
  {
    id: 'nvidia',
    name: 'NVIDIA Endpoints',
    desc: 'nvidia/nemotron-3-super-120b-a12b via build.nvidia.com',
    badge: 'Cloud',
    keyUrl: 'https://build.nvidia.com/',
    model: 'nvidia/nemotron-3-super-120b-a12b'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    desc: 'GPT models',
    keyUrl: 'https://platform.openai.com/api-keys',
    model: 'gpt-4o'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    desc: 'Claude models',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    model: 'claude-sonnet-4-20250514'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    desc: 'Gemini models',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    model: 'gemini-2.0-flash'
  }
]

class NemoClawWizard {
  private currentStep: Step = Step.Welcome
  private container: HTMLElement
  private selectedProvider: ProviderOption = PROVIDERS[0]
  private apiKey = ''
  private sandboxName = ''
  private installProgress = 0
  private installTimer: ReturnType<typeof setInterval> | null = null
  private installStartTime = 0
  private installLines: { line: string; type: string }[] = []

  constructor() {
    this.container = document.getElementById('wizard-content')!
    this.setupTitleBar()
    this.render()
  }

  private setupTitleBar(): void {
    document.getElementById('btn-minimize')!.addEventListener('click', () => {
      window.electronAPI.minimizeWindow()
    })
    document.getElementById('btn-maximize')!.addEventListener('click', () => {
      window.electronAPI.maximizeWindow()
    })
    document.getElementById('btn-close')!.addEventListener('click', () => {
      window.electronAPI.closeWindow()
    })
  }

  private updateStepProgress(): void {
    const items = document.querySelectorAll('.step-item')
    const lines = document.querySelectorAll('.step-line')

    items.forEach((item, i) => {
      item.classList.remove('active', 'done')
      if (i < this.currentStep) item.classList.add('done')
      else if (i === this.currentStep) item.classList.add('active')
    })

    lines.forEach((line, i) => {
      line.classList.toggle('done', i < this.currentStep)
    })
  }

  private goTo(step: Step): void {
    this.currentStep = step
    this.updateStepProgress()
    this.render()
  }

  private render(): void {
    switch (this.currentStep) {
      case Step.Welcome:
        this.renderWelcome()
        break
      case Step.SystemCheck:
        this.renderSystemCheck()
        break
      case Step.Provider:
        this.renderProvider()
        break
      case Step.Sandbox:
        this.renderSandbox()
        break
      case Step.Install:
        this.renderInstall()
        break
      case Step.Complete:
        this.renderComplete()
        break
    }
  }

  /* ===================== STEP 1: Welcome ===================== */
  private renderWelcome(): void {
    this.container.innerHTML = `
      <div class="step-container">
        <h1 class="welcome-heading">Nemo<span class="green">Claw</span></h1>
        <p class="welcome-subtitle">Secure AI Agent Deployment</p>
        <p class="welcome-desc">
          NemoClaw is NVIDIA's open-source reference stack for running OpenClaw AI agents
          securely inside sandboxed environments. This installer will guide you through
          setting up your first sandboxed agent.
        </p>
        <ul class="feature-list">
          <li><span class="feature-dot"></span> Sandboxed execution with Landlock, seccomp & network namespaces</li>
          <li><span class="feature-dot"></span> NVIDIA endpoint inference with multiple provider support</li>
          <li><span class="feature-dot"></span> Declarative network policy for agent isolation</li>
          <li><span class="feature-dot"></span> Blueprint lifecycle management for reproducible deployments</li>
        </ul>
        <button id="btn-get-started" class="btn btn-primary">Get Started &rarr;</button>
        <div class="welcome-footer">
          <span>v0.1.0-alpha</span>
          <span>&middot;</span>
          <a id="link-docs">Docs</a>
          <span>&middot;</span>
          <a id="link-github">GitHub</a>
        </div>
      </div>
    `

    document.getElementById('btn-get-started')!.addEventListener('click', () => {
      this.goTo(Step.SystemCheck)
    })
    document.getElementById('link-docs')!.addEventListener('click', () => {
      window.electronAPI.openExternalLink('https://docs.nvidia.com/nemoclaw/latest/')
    })
    document.getElementById('link-github')!.addEventListener('click', () => {
      window.electronAPI.openExternalLink('https://github.com/NVIDIA/NemoClaw')
    })
  }

  /* ===================== STEP 2: System Check ===================== */
  private renderSystemCheck(): void {
    this.container.innerHTML = `
      <div class="step-container">
        <h2 class="section-heading">System Requirements</h2>
        <p class="section-sub">Checking your system for prerequisites...</p>
        <div id="check-list" class="check-list">
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <span>Running checks...</span>
          </div>
        </div>
        <div id="check-actions" class="btn-row btn-row-spread" style="display:none">
          <div style="display:flex;gap:12px;align-items:center">
            <button id="btn-check-back" class="btn btn-secondary">&larr; Back</button>
            <button id="btn-recheck" class="btn btn-secondary">Re-check</button>
          </div>
          <div style="display:flex;gap:12px;align-items:center">
            <button id="btn-skip-checks" class="btn-text">Skip Checks</button>
            <button id="btn-check-continue" class="btn btn-primary" disabled>Continue &rarr;</button>
          </div>
        </div>
      </div>
    `
    this.runChecks()
  }

  private async runChecks(): Promise<void> {
    const listEl = document.getElementById('check-list')!
    const actionsEl = document.getElementById('check-actions')!

    try {
      const result: SystemCheckResponse = await window.electronAPI.checkSystemRequirements()
      listEl.innerHTML = ''

      for (const check of result.checks) {
        const icon = check.status === 'pass' ? '&#x2705;' : check.status === 'warn' ? '&#x26A0;&#xFE0F;' : '&#x274C;'
        const fixBtn = check.fixUrl || check.fixCommand
          ? `<button class="check-fix-btn" data-url="${check.fixUrl || ''}" data-cmd="${check.fixCommand || ''}">Fix</button>`
          : ''

        listEl.innerHTML += `
          <div class="check-card">
            <span class="check-icon">${icon}</span>
            <div class="check-info">
              <div class="check-name">${check.name}</div>
              <div class="check-value">${check.value}</div>
              <div class="check-message">${check.message}</div>
            </div>
            ${fixBtn}
          </div>
        `
      }

      // Attach fix button listeners
      listEl.querySelectorAll('.check-fix-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const url = (btn as HTMLElement).dataset.url
          const cmd = (btn as HTMLElement).dataset.cmd
          if (url) window.electronAPI.openExternalLink(url)
          else if (cmd) navigator.clipboard.writeText(cmd)
        })
      })

      actionsEl.style.display = 'flex'
      const continueBtn = document.getElementById('btn-check-continue') as HTMLButtonElement
      if (result.allPassed) continueBtn.disabled = false

      document.getElementById('btn-check-back')!.addEventListener('click', () => this.goTo(Step.Welcome))
      document.getElementById('btn-recheck')!.addEventListener('click', () => this.renderSystemCheck())
      document.getElementById('btn-skip-checks')!.addEventListener('click', () => this.goTo(Step.Provider))
      continueBtn.addEventListener('click', () => this.goTo(Step.Provider))
    } catch (err) {
      listEl.innerHTML = `<div class="form-error">Failed to run system checks: ${(err as Error).message}</div>`
      actionsEl.style.display = 'flex'
      document.getElementById('btn-check-back')!.addEventListener('click', () => this.goTo(Step.Welcome))
      document.getElementById('btn-recheck')!.addEventListener('click', () => this.renderSystemCheck())
      document.getElementById('btn-skip-checks')!.addEventListener('click', () => this.goTo(Step.Provider))
    }
  }

  /* ===================== STEP 3: Provider ===================== */
  private renderProvider(): void {
    const isOllama = this.selectedProvider.id === 'ollama'

    this.container.innerHTML = `
      <div class="step-container">
        <h2 class="section-heading">Inference Provider</h2>
        <p class="section-sub">Choose your AI inference provider. Ollama is pre-installed on this machine.</p>
        <div id="provider-grid" class="provider-grid">
          ${PROVIDERS.map(
            (p) => `
            <div class="provider-card${p.id === this.selectedProvider.id ? ' selected' : ''}" data-provider="${p.id}" id="provider-${p.id}">
              <div class="provider-radio"><div class="provider-radio-inner"></div></div>
              <div class="provider-info">
                <div class="provider-name">${p.name}</div>
                <div class="provider-desc">${p.desc}</div>
              </div>
              ${p.badge ? `<span class="provider-badge${p.id === 'ollama' ? ' badge-local' : ''}">${p.badge}</span>` : ''}
            </div>
          `
          ).join('')}
        </div>
        <div id="api-key-section" class="form-group" style="display:${isOllama ? 'none' : 'block'}">
          <label class="form-label" for="input-api-key">API Key</label>
          <div class="input-wrapper">
            <input type="password" id="input-api-key" class="form-input mono" placeholder="Enter your API key" value="${this.escapeHtml(this.apiKey)}" />
            <button id="btn-toggle-key" class="input-toggle">Show</button>
          </div>
          <div class="form-hint">
            <a id="link-get-key">Get API Key &rarr;</a>
          </div>
          <div class="form-hint">Your key is stored locally at ~/.nemoclaw/credentials.json</div>
          <div id="api-key-error" class="form-error" style="display:none"></div>
        </div>
        <div id="ollama-info" class="ollama-info-box" style="display:${isOllama ? 'flex' : 'none'}">
          <span class="ollama-icon">🦙</span>
          <div>
            <div class="ollama-title">Local Inference — No API Key Required</div>
            <div class="ollama-desc">Ollama is pre-installed on this machine. NemoClaw will use it for local model inference. No cloud credentials needed.</div>
          </div>
        </div>
        <div class="btn-row btn-row-spread">
          <button id="btn-provider-back" class="btn btn-secondary">&larr; Back</button>
          <div style="display:flex;gap:12px;align-items:center">
            <button id="btn-skip-defaults" class="btn-text" title="Use Ollama with default settings">Skip with Defaults</button>
            <button id="btn-provider-continue" class="btn btn-primary">${isOllama ? 'Continue →' : 'Continue →'}</button>
          </div>
        </div>
      </div>
    `

    // Provider card selection
    const updateApiKeyVisibility = (): void => {
      const apiSection = document.getElementById('api-key-section')
      const ollamaInfo = document.getElementById('ollama-info')
      if (apiSection) apiSection.style.display = this.selectedProvider.noApiKey ? 'none' : 'block'
      if (ollamaInfo) ollamaInfo.style.display = this.selectedProvider.noApiKey ? 'flex' : 'none'
    }

    document.querySelectorAll('.provider-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.provider as string
        this.selectedProvider = PROVIDERS.find((p) => p.id === id)!
        document.querySelectorAll('.provider-card').forEach((c) => c.classList.remove('selected'))
        card.classList.add('selected')
        updateApiKeyVisibility()
        this.hideApiError()
      })
    })

    // Toggle password visibility
    const keyInput = document.getElementById('input-api-key') as HTMLInputElement
    document.getElementById('btn-toggle-key')!.addEventListener('click', () => {
      const btn = document.getElementById('btn-toggle-key')!
      if (keyInput.type === 'password') {
        keyInput.type = 'text'
        btn.textContent = 'Hide'
      } else {
        keyInput.type = 'password'
        btn.textContent = 'Show'
      }
    })

    // Get API Key link
    document.getElementById('link-get-key')!.addEventListener('click', () => {
      if (this.selectedProvider.keyUrl) {
        window.electronAPI.openExternalLink(this.selectedProvider.keyUrl)
      }
    })

    // "Skip with Defaults" — auto-select Ollama + default sandbox name, jump to Install
    document.getElementById('btn-skip-defaults')!.addEventListener('click', () => {
      this.selectedProvider = PROVIDERS.find((p) => p.id === 'ollama')!
      this.apiKey = ''
      this.sandboxName = this.sandboxName || 'my-assistant'
      this.goTo(Step.Sandbox)
    })

    // Navigation — Back
    document.getElementById('btn-provider-back')!.addEventListener('click', () => {
      if (keyInput) this.apiKey = keyInput.value
      this.goTo(Step.SystemCheck)
    })

    // Navigation — Continue
    document.getElementById('btn-provider-continue')!.addEventListener('click', async () => {
      // For Ollama: no API key needed, skip validation
      if (this.selectedProvider.noApiKey) {
        this.apiKey = ''
        this.goTo(Step.Sandbox)
        return
      }

      // For cloud providers: validate API key
      this.apiKey = keyInput.value.trim()
      if (!this.apiKey) {
        this.showApiError('Please enter an API key')
        return
      }

      const btn = document.getElementById('btn-provider-continue') as HTMLButtonElement
      btn.disabled = true
      btn.innerHTML = '<div class="loading-spinner"></div> Validating...'
      this.hideApiError()

      try {
        const result = await window.electronAPI.validateApiKey(this.selectedProvider.id, this.apiKey)
        if (result.valid) {
          this.goTo(Step.Sandbox)
        } else {
          this.showApiError(result.message || 'Invalid API key')
          btn.disabled = false
          btn.textContent = 'Retry'
        }
      } catch (err) {
        this.showApiError((err as Error).message)
        btn.disabled = false
        btn.textContent = 'Retry'
      }
    })
  }

  private showApiError(msg: string): void {
    const el = document.getElementById('api-key-error')
    if (el) {
      el.textContent = msg
      el.style.display = 'block'
    }
  }

  private hideApiError(): void {
    const el = document.getElementById('api-key-error')
    if (el) el.style.display = 'none'
  }

  /* ===================== STEP 4: Sandbox ===================== */
  private renderSandbox(): void {
    this.container.innerHTML = `
      <div class="step-container">
        <h2 class="section-heading">Sandbox Configuration</h2>
        <p class="section-sub">Name your sandbox environment.</p>
        <div class="form-group">
          <label class="form-label" for="input-sandbox-name">Sandbox Name</label>
          <input type="text" id="input-sandbox-name" class="form-input mono" placeholder="my-assistant" value="${this.escapeHtml(this.sandboxName)}" />
          <div id="sandbox-validation" class="form-hint"></div>
        </div>
        <div class="glass-card summary-card">
          <div class="summary-row">
            <span class="summary-label">Provider</span>
            <span class="summary-value">${this.selectedProvider.name}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Model</span>
            <span class="summary-value">${this.selectedProvider.model}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Sandbox Name</span>
            <span class="summary-value" id="summary-sandbox-name">${this.sandboxName || '—'}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Security</span>
            <span class="summary-value">Landlock + seccomp + netns</span>
          </div>
        </div>
        <div class="btn-row btn-row-spread">
          <button id="btn-sandbox-back" class="btn btn-secondary">&larr; Back</button>
          <button id="btn-sandbox-continue" class="btn btn-primary" disabled>Begin Installation &rarr;</button>
        </div>
      </div>
    `

    const nameInput = document.getElementById('input-sandbox-name') as HTMLInputElement
    const validationEl = document.getElementById('sandbox-validation')!
    const summaryEl = document.getElementById('summary-sandbox-name')!
    const continueBtn = document.getElementById('btn-sandbox-continue') as HTMLButtonElement
    const nameRegex = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/

    const validate = (): void => {
      const val = nameInput.value.toLowerCase()
      nameInput.value = val
      this.sandboxName = val

      summaryEl.textContent = val || '—'

      if (!val) {
        validationEl.innerHTML = ''
        validationEl.className = 'form-hint'
        continueBtn.disabled = true
        return
      }

      if (nameRegex.test(val)) {
        validationEl.innerHTML = '&#x2713; Valid name'
        validationEl.className = 'form-success'
        continueBtn.disabled = false
      } else {
        let msg = 'Must be lowercase alphanumeric + hyphens, start/end with alphanumeric, max 63 chars'
        if (val.length > 63) msg = 'Name too long (max 63 characters)'
        validationEl.textContent = msg
        validationEl.className = 'form-error'
        continueBtn.disabled = true
      }
    }

    nameInput.addEventListener('input', validate)
    if (this.sandboxName) validate()

    document.getElementById('btn-sandbox-back')!.addEventListener('click', () => this.goTo(Step.Provider))
    continueBtn.addEventListener('click', () => this.goTo(Step.Install))
  }

  /* ===================== STEP 5: Install ===================== */
  private renderInstall(): void {
    this.installLines = []
    this.installProgress = 0
    this.installStartTime = Date.now()

    this.container.innerHTML = `
      <div class="step-container">
        <h2 class="section-heading">Installing NemoClaw</h2>
        <p class="section-sub">This may take a few minutes. Do not close the window.</p>
        <div class="progress-info">
          <span id="install-percent">0%</span>
          <span id="install-elapsed">0:00</span>
        </div>
        <div class="progress-bar-container">
          <div id="install-progress-bar" class="progress-bar-fill" style="width:0%"></div>
        </div>
        <div id="install-status" class="progress-status">Starting...</div>
        <div style="display:flex;justify-content:flex-end;margin-bottom:4px">
          <button id="btn-toggle-debug">Show Debug Logs</button>
        </div>
        <div id="install-terminal" class="terminal-area hide-debug"></div>
        <div class="btn-row btn-row-spread">
          <button id="btn-cancel-install" class="btn btn-danger">Cancel</button>
          <button id="btn-retry-install" class="btn btn-primary" style="display:none">Retry</button>
        </div>
      </div>
    `

    // Elapsed timer
    this.installTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.installStartTime) / 1000)
      const mins = Math.floor(elapsed / 60)
      const secs = elapsed % 60
      const el = document.getElementById('install-elapsed')
      if (el) el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`
    }, 1000)

    // Debug log toggle
    document.getElementById('btn-toggle-debug')!.addEventListener('click', () => {
      const terminal = document.getElementById('install-terminal')!
      const btn = document.getElementById('btn-toggle-debug')!
      terminal.classList.toggle('hide-debug')
      const showing = !terminal.classList.contains('hide-debug')
      btn.textContent = showing ? 'Hide Debug Logs' : 'Show Debug Logs'
      btn.classList.toggle('active', showing)
      terminal.scrollTop = terminal.scrollHeight
    })

    // Cancel
    document.getElementById('btn-cancel-install')!.addEventListener('click', async () => {
      if (confirm('Are you sure you want to cancel the installation?')) {
        await window.electronAPI.cancelInstall()
        if (this.installTimer) clearInterval(this.installTimer)
        this.goTo(Step.Sandbox)
      }
    })

    // Clean up old listeners and start
    window.electronAPI.removeInstallListeners()

    window.electronAPI.onInstallOutput((event: InstallOutputEvent) => {
      this.installLines.push(event)
      this.appendTerminalLine(event.line, event.type)
      this.updateProgress(event.line)
    })

    window.electronAPI.onInstallComplete((event: InstallCompleteEvent) => {
      if (this.installTimer) clearInterval(this.installTimer)

      if (event.success) {
        this.setProgress(100)
        const statusEl = document.getElementById('install-status')
        if (statusEl) statusEl.textContent = 'Installation complete!'
        setTimeout(() => this.goTo(Step.Complete), 1500)
      } else {
        const statusEl = document.getElementById('install-status')
        if (statusEl) {
          statusEl.textContent = `Error: ${event.message}`
          statusEl.style.color = 'var(--danger)'
        }
        const retryBtn = document.getElementById('btn-retry-install')
        if (retryBtn) retryBtn.style.display = 'inline-flex'
        document.getElementById('btn-retry-install')?.addEventListener('click', () => {
          this.renderInstall()
        })
      }
    })

    // Start install
    const config: InstallConfig = {
      provider: this.selectedProvider.id,
      providerLabel: this.selectedProvider.name,
      apiKey: this.apiKey,
      sandboxName: this.sandboxName,
      modelName: this.selectedProvider.model
    }
    window.electronAPI.runInstall(config)
  }

  private appendTerminalLine(line: string, type: string): void {
    const terminal = document.getElementById('install-terminal')
    if (!terminal) return

    const lineEl = document.createElement('div')
    lineEl.className = `terminal-line ${type}`
    lineEl.textContent = line
    terminal.appendChild(lineEl)
    terminal.scrollTop = terminal.scrollHeight
  }

  private updateProgress(line: string): void {
    const lower = line.toLowerCase()
    let progress = this.installProgress

    // Match the 7-step install flow from ipc-handlers
    if (lower.includes('[1/7]')) progress = Math.max(progress, 5)
    else if (lower.includes('[2/7]')) progress = Math.max(progress, 10)
    else if (lower.includes('installing nvm')) progress = Math.max(progress, 15)
    else if (lower.includes('nvm install')) progress = Math.max(progress, 20)
    else if (lower.includes('[3/7]')) progress = Math.max(progress, 25)
    else if (lower.includes('[4/7]')) progress = Math.max(progress, 30)
    else if (lower.includes('fetching latest')) progress = Math.max(progress, 35)
    else if (lower.includes('cloning')) progress = Math.max(progress, 40)
    else if (lower.includes('npm install')) progress = Math.max(progress, 50)
    else if (lower.includes('npm link')) progress = Math.max(progress, 55)
    else if (lower.includes('[5/7]')) progress = Math.max(progress, 60)
    else if (lower.includes('installing openshell')) progress = Math.max(progress, 65)
    else if (lower.includes('[6/7]')) progress = Math.max(progress, 70)
    else if (lower.includes('creating sandbox') || lower.includes('blueprint')) progress = Math.max(progress, 80)
    else if (lower.includes('applying polic') || lower.includes('network policy')) progress = Math.max(progress, 90)
    else if (lower.includes('[7/7]')) progress = Math.max(progress, 100)

    if (progress > this.installProgress) {
      this.setProgress(progress)
    }

    // Update status text
    const statusEl = document.getElementById('install-status')
    if (statusEl && line.trim()) {
      statusEl.textContent = `Current: ${line.trim().substring(0, 80)}`
    }
  }

  private setProgress(percent: number): void {
    this.installProgress = percent
    const bar = document.getElementById('install-progress-bar')
    const percentEl = document.getElementById('install-percent')
    if (bar) bar.style.width = `${percent}%`
    if (percentEl) percentEl.textContent = `${percent}%`
  }

  /* ===================== STEP 6: Complete ===================== */
  private renderComplete(): void {
    if (this.installTimer) clearInterval(this.installTimer)
    window.electronAPI.removeInstallListeners()

    this.container.innerHTML = `
      <div class="step-container">
        <div class="complete-check">
          <span class="complete-check-icon">&#x2713;</span>
        </div>
        <h2 class="complete-heading">Installation Complete!</h2>
        <div class="glass-card summary-card">
          <div class="summary-row">
            <span class="summary-label">Sandbox</span>
            <span class="summary-value">${this.escapeHtml(this.sandboxName)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Model</span>
            <span class="summary-value">${this.selectedProvider.model}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Security</span>
            <span class="summary-value">Landlock + seccomp + netns</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Status</span>
            <span class="summary-value" style="color:var(--nv-green)">Running</span>
          </div>
        </div>
        <div class="action-grid">
          <div class="action-card" id="action-connect" data-cmd="nemoclaw ${this.escapeHtml(this.sandboxName)} connect">
            <div class="action-icon">&#x1F517;</div>
            <div class="action-label">Connect</div>
            <div class="action-cmd">nemoclaw ${this.escapeHtml(this.sandboxName)} connect</div>
          </div>
          <div class="action-card" id="action-status" data-cmd="nemoclaw ${this.escapeHtml(this.sandboxName)} status">
            <div class="action-icon">&#x1F4CA;</div>
            <div class="action-label">Status</div>
            <div class="action-cmd">nemoclaw ${this.escapeHtml(this.sandboxName)} status</div>
          </div>
          <div class="action-card" id="action-logs" data-cmd="nemoclaw ${this.escapeHtml(this.sandboxName)} logs --follow">
            <div class="action-icon">&#x1F4CB;</div>
            <div class="action-label">Logs</div>
            <div class="action-cmd">nemoclaw ${this.escapeHtml(this.sandboxName)} logs --follow</div>
          </div>
          <div class="action-card" id="action-docs">
            <div class="action-icon">&#x1F4D6;</div>
            <div class="action-label">Docs</div>
            <div class="action-cmd">docs.nvidia.com/nemoclaw</div>
          </div>
        </div>
        <div class="cmd-block">
# Quick reference\n
nemoclaw ${this.escapeHtml(this.sandboxName)} connect    # Connect to sandbox\n
nemoclaw ${this.escapeHtml(this.sandboxName)} status     # Check status\n
nemoclaw ${this.escapeHtml(this.sandboxName)} logs -f    # Follow logs\n
nemoclaw ${this.escapeHtml(this.sandboxName)} stop       # Stop sandbox
        </div>
        <div class="btn-row" style="justify-content:center;margin-top:16px">
          <button id="btn-close-installer" class="btn btn-secondary">Close Installer</button>
        </div>
      </div>
    `

    // Action cards — copy to clipboard
    document.querySelectorAll('.action-card[data-cmd]').forEach((card) => {
      card.addEventListener('click', (e) => {
        const cmd = (card as HTMLElement).dataset.cmd
        if (cmd) {
          navigator.clipboard.writeText(cmd)
          this.showTooltip(e as MouseEvent, 'Copied to clipboard!')
        }
      })
    })

    // Docs action opens external
    document.getElementById('action-docs')!.addEventListener('click', () => {
      window.electronAPI.openExternalLink('https://docs.nvidia.com/nemoclaw/latest/')
    })

    // Close
    document.getElementById('btn-close-installer')!.addEventListener('click', () => {
      window.electronAPI.closeWindow()
    })
  }

  private showTooltip(event: MouseEvent, text: string): void {
    const tip = document.createElement('div')
    tip.className = 'tooltip'
    tip.textContent = text
    tip.style.left = `${event.clientX}px`
    tip.style.top = `${event.clientY - 40}px`
    document.body.appendChild(tip)
    setTimeout(() => tip.remove(), 1500)
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new NemoClawWizard()
})
