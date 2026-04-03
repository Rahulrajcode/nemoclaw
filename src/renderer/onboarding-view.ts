/**
 * Onboarding View — 4-step open-coot onboarding wizard (macOS only).
 *
 * Step 1: Workspace type, tools used, team size
 * Step 2: Invite collaborators (optional, local only)
 * Step 3: Connect knowledge sources (store selections)
 * Step 4: Initialize microapps (store selections)
 *
 * After Step 4 → save config.json → navigate to dashboard
 */

import type { AppConfig, InviteEntry } from '../shared/types'
import { navigateToDashboard } from './router'

interface OnboardingState {
  workspaceType: string
  tools: string[]
  teamSize: string
  invites: InviteEntry[]
  connectors: Record<string, boolean>
  microapps: string[]
}

const state: OnboardingState = {
  workspaceType: '',
  tools: [],
  teamSize: '',
  invites: [],
  connectors: { 'local-files': true },
  microapps: []
}

let currentStep = 1
let rootContainer: HTMLElement

export function renderOnboarding(container: HTMLElement): void {
  rootContainer = container
  renderStep()
}

function renderStep(): void {
  switch (currentStep) {
    case 1: renderStep1(); break
    case 2: renderStep2(); break
    case 3: renderStep3(); break
    case 4: renderStep4(); break
  }
}

function goToStep(step: number): void {
  currentStep = step
  renderStep()
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP 1 — Workspace Setup
// ═══════════════════════════════════════════════════════════════════════════════

function renderStep1(): void {
  rootContainer.innerHTML = `
    <div class="oc-onboarding">
      <div class="oc-window-chrome">
        <div class="oc-traffic-lights">
          <div class="oc-tl oc-tl-red"></div>
          <div class="oc-tl oc-tl-yellow"></div>
          <div class="oc-tl oc-tl-green"></div>
        </div>
        <div class="oc-window-title">open-coot — First Launch Setup</div>
        <div style="width:52px;"></div>
      </div>

      <div class="oc-ob-body">
        <div class="oc-ob-card">
          <div class="oc-ob-progress">
            <div class="oc-ob-progress-bar"><div class="oc-ob-progress-fill" style="width:25%"></div></div>
            <span class="oc-ob-step">Step 1 of 4</span>
          </div>

          <h2 class="oc-ob-heading">Tell us about your workspace</h2>
          <p class="oc-ob-sub">We'll tailor open-coot so it feels right from day one. You can always change this later.</p>

          <div class="oc-ob-section-label">What's the main purpose?</div>
          <div class="oc-purpose-grid" id="oc-purpose-grid">
            ${purposeCard('personal', '🧑‍💻', 'Personal productivity', 'Just you. Automate your own tools, notes, and workflows.')}
            ${purposeCard('family', '🏠', 'Family coordination', 'Shared tasks, calendars, budgets — for the household.')}
            ${purposeCard('team', '👥', 'Team collaboration', 'A workspace for your startup, agency, or department.')}
            ${purposeCard('developer', '🔧', 'Custom / developer', "I know what I'm doing — give me full control.")}
          </div>

          <div class="oc-ob-section-label">Have you used any of these before?</div>
          <div class="oc-tech-pills" id="oc-tech-pills">
            ${techPill('n8n')}${techPill('Zapier')}${techPill('Notion')}${techPill('Make (Integromat)')}
            ${techPill('Local AI / Ollama')}${techPill('Google Drive')}${techPill('Slack')}${techPill('None of these')}
          </div>

          <div class="oc-ob-section-label">How many people in your workspace?</div>
          <div class="oc-size-grid" id="oc-size-grid">
            ${sizeCard('1', 'Just me')}
            ${sizeCard('2-5', 'Family / small team')}
            ${sizeCard('6-20', 'Team')}
            ${sizeCard('20+', 'Organization')}
          </div>

          <div class="oc-ob-actions">
            <div></div>
            <button id="oc-step1-continue" class="oc-btn-primary">Continue →</button>
          </div>
        </div>
      </div>
    </div>
  `

  // Restore state
  if (state.workspaceType) {
    const card = document.querySelector(`.oc-purpose-card[data-value="${state.workspaceType}"]`)
    card?.classList.add('oc-sel')
  }
  state.tools.forEach(t => {
    const pill = Array.from(document.querySelectorAll('.oc-tech-pill')).find(
      el => el.textContent?.trim() === t
    )
    pill?.classList.add('oc-sel')
  })
  if (state.teamSize) {
    const card = document.querySelector(`.oc-size-card[data-value="${state.teamSize}"]`)
    card?.classList.add('oc-sel')
  }

  // Purpose cards — single select
  document.querySelectorAll('.oc-purpose-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.oc-purpose-card').forEach(c => c.classList.remove('oc-sel'))
      card.classList.add('oc-sel')
      state.workspaceType = (card as HTMLElement).dataset.value || ''
    })
  })

  // Tech pills — multi toggle
  document.querySelectorAll('.oc-tech-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('oc-sel')
      state.tools = Array.from(document.querySelectorAll('.oc-tech-pill.oc-sel'))
        .map(el => el.textContent?.trim() || '')
    })
  })

  // Size cards — single select
  document.querySelectorAll('.oc-size-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.oc-size-card').forEach(c => c.classList.remove('oc-sel'))
      card.classList.add('oc-sel')
      state.teamSize = (card as HTMLElement).dataset.value || ''
    })
  })

  document.getElementById('oc-step1-continue')!.addEventListener('click', () => goToStep(2))
}

function purposeCard(value: string, icon: string, label: string, desc: string): string {
  return `
    <div class="oc-purpose-card" data-value="${value}">
      <div class="oc-purpose-top"><span class="oc-purpose-icon">${icon}</span><span class="oc-purpose-label">${label}</span></div>
      <div class="oc-purpose-desc">${desc}</div>
    </div>
  `
}

function techPill(label: string): string {
  return `<div class="oc-tech-pill"><div class="oc-tech-pill-dot"></div>${label}</div>`
}

function sizeCard(value: string, label: string): string {
  return `
    <div class="oc-size-card" data-value="${value}">
      <div class="oc-size-num">${value}</div>
      <div class="oc-size-label">${label}</div>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP 2 — Invite Members
// ═══════════════════════════════════════════════════════════════════════════════

function renderStep2(): void {
  rootContainer.innerHTML = `
    <div class="oc-onboarding">
      <div class="oc-window-chrome">
        <div class="oc-traffic-lights">
          <div class="oc-tl oc-tl-red"></div>
          <div class="oc-tl oc-tl-yellow"></div>
          <div class="oc-tl oc-tl-green"></div>
        </div>
        <div class="oc-window-title">open-coot — Setup</div>
        <div style="width:52px;"></div>
      </div>

      <div class="oc-ob-body">
        <div class="oc-ob-card">
          <div class="oc-ob-progress">
            <div class="oc-ob-progress-bar"><div class="oc-ob-progress-fill" style="width:50%"></div></div>
            <span class="oc-ob-step">Step 2 of 4</span>
          </div>

          <h2 class="oc-ob-heading">Invite your people</h2>
          <p class="oc-ob-sub">Add team or family members now, or skip and do it later from Settings.</p>

          <div class="oc-ob-section-label">Send invitations</div>
          <div id="oc-invite-rows">
            <div class="oc-invite-row">
              <input class="oc-input" type="email" placeholder="colleague@email.com" />
              <select class="oc-role-select">
                <option>Admin</option>
                <option selected>Member</option>
                <option>Viewer</option>
              </select>
              <button class="oc-btn-secondary oc-add-invite-btn">+ Add</button>
            </div>
          </div>

          <div id="oc-pending-invites" class="oc-member-list" style="${state.invites.length ? '' : 'display:none'}">
            <div class="oc-member-list-label">Pending invites (${state.invites.length})</div>
            <div id="oc-invite-list-items"></div>
          </div>

          <div class="oc-role-legend">
            <div class="oc-role-legend-item"><span class="oc-badge oc-badge-danger">Admin</span> Full access, can manage members &amp; settings</div>
            <div class="oc-role-legend-item"><span class="oc-badge oc-badge-primary">Member</span> Can create &amp; edit workflows and connectors</div>
            <div class="oc-role-legend-item"><span class="oc-badge oc-badge-muted">Viewer</span> Read-only access across the workspace</div>
          </div>

          <div class="oc-ob-actions">
            <button class="oc-btn-ghost" id="oc-step2-back">← Back</button>
            <div class="oc-ob-actions-right">
              <button class="oc-btn-ghost" id="oc-step2-skip">Skip for now</button>
              <button class="oc-btn-primary" id="oc-step2-continue">Continue →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  renderInviteList()
  setupInviteHandlers()

  document.getElementById('oc-step2-back')!.addEventListener('click', () => goToStep(1))
  document.getElementById('oc-step2-skip')!.addEventListener('click', () => goToStep(3))
  document.getElementById('oc-step2-continue')!.addEventListener('click', () => goToStep(3))
}

function setupInviteHandlers(): void {
  document.querySelector('.oc-add-invite-btn')!.addEventListener('click', () => {
    const row = document.querySelector('.oc-invite-row')!
    const emailInput = row.querySelector('input') as HTMLInputElement
    const roleSelect = row.querySelector('select') as HTMLSelectElement

    const email = emailInput.value.trim()
    if (!email || !email.includes('@')) return

    state.invites.push({ email, role: roleSelect.value.toLowerCase() as InviteEntry['role'] })
    emailInput.value = ''
    renderInviteList()
  })
}

function renderInviteList(): void {
  const container = document.getElementById('oc-pending-invites')!
  const listItems = document.getElementById('oc-invite-list-items')!

  if (state.invites.length === 0) {
    container.style.display = 'none'
    return
  }

  container.style.display = 'block'
  container.querySelector('.oc-member-list-label')!.textContent = `Pending invites (${state.invites.length})`

  const colors = ['#4F46E5', '#0891B2', '#D946EF', '#F97316', '#10B981']

  listItems.innerHTML = state.invites.map((inv, i) => {
    const initials = inv.email.substring(0, 2).toUpperCase()
    const color = colors[i % colors.length]
    const badgeClass = inv.role === 'admin' ? 'oc-badge-danger' : inv.role === 'member' ? 'oc-badge-primary' : 'oc-badge-muted'
    return `
      <div class="oc-member-row">
        <div class="oc-member-av" style="background:${color};">${initials}</div>
        <div class="oc-member-info">
          <div class="oc-member-name">${inv.email}</div>
          <div class="oc-member-email">Saved locally</div>
        </div>
        <span class="oc-badge ${badgeClass}">${inv.role.charAt(0).toUpperCase() + inv.role.slice(1)}</span>
      </div>
    `
  }).join('')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP 3 — Connect Knowledge Sources
// ═══════════════════════════════════════════════════════════════════════════════

const CONNECTORS = [
  { id: 'local-files', icon: '📁', name: 'Local Files', desc: 'Access folders & files on this machine directly. No auth needed.', default: true },
  { id: 'google-drive', icon: '🔵', name: 'Google Drive', desc: 'Docs, Sheets, and Slides from your Google Workspace account.' },
  { id: 'slack', icon: '💬', name: 'Slack', desc: 'Read channels, send messages, and trigger workflows from Slack events.' },
  { id: 'notion', icon: '📓', name: 'Notion', desc: 'Sync pages, databases, and knowledge bases from your Notion workspace.' },
  { id: 'github', icon: '🐙', name: 'GitHub', desc: 'Repos, issues, and PRs — trigger actions from code events automatically.' },
  { id: 'onedrive', icon: '☁️', name: 'OneDrive', desc: 'Microsoft 365 files, SharePoint documents, and Teams content.' }
]

function renderStep3(): void {
  rootContainer.innerHTML = `
    <div class="oc-onboarding">
      <div class="oc-window-chrome">
        <div class="oc-traffic-lights">
          <div class="oc-tl oc-tl-red"></div>
          <div class="oc-tl oc-tl-yellow"></div>
          <div class="oc-tl oc-tl-green"></div>
        </div>
        <div class="oc-window-title">open-coot — Setup</div>
        <div style="width:52px;"></div>
      </div>

      <div class="oc-ob-body" style="align-items:flex-start; padding-top:32px;">
        <div class="oc-ob-card oc-ob-card-wide">
          <div class="oc-ob-progress">
            <div class="oc-ob-progress-bar"><div class="oc-ob-progress-fill" style="width:75%"></div></div>
            <span class="oc-ob-step">Step 3 of 4</span>
          </div>

          <h2 class="oc-ob-heading">Connect your knowledge sources</h2>
          <p class="oc-ob-sub">Choose where your data lives. open-coot reads, syncs, and learns from your connected sources. Connect what you need now — more can be added anytime.</p>

          <div class="oc-ob-section-label">Available connectors</div>
          <div class="oc-connectors-grid">
            ${CONNECTORS.map(c => connectorCard(c)).join('')}
          </div>

          <div class="oc-ob-actions">
            <button class="oc-btn-ghost" id="oc-step3-back">← Back</button>
            <button class="oc-btn-primary" id="oc-step3-continue">Continue →</button>
          </div>
        </div>
      </div>
    </div>
  `

  // Restore state
  Object.entries(state.connectors).forEach(([id, connected]) => {
    if (connected) {
      const card = document.querySelector(`.oc-conn-card[data-id="${id}"]`)
      card?.classList.add('oc-connected')
      const btn = card?.querySelector('.oc-conn-btn')
      if (btn) {
        btn.classList.remove('oc-idle')
        btn.classList.add('oc-active')
        btn.textContent = '✓ Connected'
      }
    }
  })

  // Toggle connector
  document.querySelectorAll('.oc-conn-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.oc-conn-card') as HTMLElement
      const id = card.dataset.id || ''
      const isConnected = card.classList.contains('oc-connected')

      if (isConnected) {
        card.classList.remove('oc-connected')
        btn.classList.remove('oc-active')
        btn.classList.add('oc-idle')
        btn.textContent = `Connect ${card.dataset.name}`
        delete state.connectors[id]
      } else {
        card.classList.add('oc-connected')
        btn.classList.remove('oc-idle')
        btn.classList.add('oc-active')
        btn.textContent = '✓ Connected'
        state.connectors[id] = true
      }
    })
  })

  document.getElementById('oc-step3-back')!.addEventListener('click', () => goToStep(2))
  document.getElementById('oc-step3-continue')!.addEventListener('click', () => goToStep(4))
}

function connectorCard(c: { id: string; icon: string; name: string; desc: string; default?: boolean }): string {
  const isDefault = c.default || state.connectors[c.id]
  return `
    <div class="oc-conn-card${isDefault ? ' oc-connected' : ''}" data-id="${c.id}" data-name="${c.name}">
      <div class="oc-conn-card-top">
        <div class="oc-conn-logo">${c.icon}</div>
        <div class="oc-conn-status" style="color:${isDefault ? 'var(--oc-success)' : 'var(--oc-text-muted)'};">
          <span class="oc-status-dot ${isDefault ? 'oc-running' : 'oc-inactive'}"></span>
          ${isDefault ? 'Connected' : 'Not connected'}
        </div>
      </div>
      <div class="oc-conn-name">${c.name}</div>
      <div class="oc-conn-desc">${c.desc}</div>
      <button class="oc-conn-btn ${isDefault ? 'oc-active' : 'oc-idle'}">${isDefault ? '✓ Connected' : `Connect ${c.name}`}</button>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP 4 — Microapps
// ═══════════════════════════════════════════════════════════════════════════════

const MICROAPPS = [
  { id: 'finance', icon: '💰', name: 'Finance Tracker', desc: 'Budgets, expenses, and reports connected to your bank feeds and spreadsheets.', recommended: true, color: 'var(--oc-warning-muted)' },
  { id: 'knowledge', icon: '🧠', name: 'Knowledge Base', desc: 'AI-powered search and Q&A across all your connected docs, notes, and files.', recommended: true, color: 'var(--oc-primary-muted)' },
  { id: 'projects', icon: '📋', name: 'Project Manager', desc: 'Tasks, milestones, and timelines with automated workflow triggers on status changes.', color: 'var(--oc-success-muted)' },
  { id: 'hr', icon: '👥', name: 'HR Assistant', desc: 'Onboarding checklists, leave requests, and team directory — built for small teams.', color: 'rgba(79,70,229,0.15)' },
  { id: 'support', icon: '💬', name: 'Customer Support', desc: 'AI-assisted ticket routing, canned responses, and escalation workflows for your team.', color: 'rgba(20,184,166,0.12)' },
  { id: 'custom', icon: '⚙️', name: 'Custom Microapp', desc: 'Build your own microapp from a template or from scratch using the open-coot SDK.', dashed: true, color: 'var(--oc-surface-2)' }
]

function renderStep4(): void {
  rootContainer.innerHTML = `
    <div class="oc-onboarding">
      <div class="oc-window-chrome">
        <div class="oc-traffic-lights">
          <div class="oc-tl oc-tl-red"></div>
          <div class="oc-tl oc-tl-yellow"></div>
          <div class="oc-tl oc-tl-green"></div>
        </div>
        <div class="oc-window-title">open-coot — Setup</div>
        <div style="width:52px;"></div>
      </div>

      <div class="oc-ob-body" style="align-items:flex-start; padding-top:32px;">
        <div class="oc-ob-card oc-ob-card-wide">
          <div class="oc-ob-progress">
            <div class="oc-ob-progress-bar"><div class="oc-ob-progress-fill" style="width:100%"></div></div>
            <span class="oc-ob-step">Step 4 of 4</span>
          </div>

          <h2 class="oc-ob-heading">Initialize your microapps</h2>
          <p class="oc-ob-sub">Microapps are purpose-built modules that live inside your workspace. Select the ones that fit — you can add, remove, or build custom ones anytime.</p>

          <div class="oc-ob-section-label">Choose your microapps · click to toggle</div>
          <div class="oc-microapps-grid">
            ${MICROAPPS.map(m => microappCard(m)).join('')}
          </div>

          <div class="oc-ob-actions" style="margin-top:32px;">
            <button class="oc-btn-ghost" id="oc-step4-back">← Back</button>
            <button class="oc-btn-launch" id="oc-step4-launch">🚀 &nbsp;Launch open-coot</button>
          </div>
        </div>
      </div>
    </div>
  `

  // Restore state
  state.microapps.forEach(id => {
    const card = document.querySelector(`.oc-ma-card[data-id="${id}"]`)
    card?.classList.add('oc-sel')
  })

  // Toggle microapp
  document.querySelectorAll('.oc-ma-card').forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('oc-sel')
      state.microapps = Array.from(document.querySelectorAll('.oc-ma-card.oc-sel'))
        .map(el => (el as HTMLElement).dataset.id || '')
    })
  })

  document.getElementById('oc-step4-back')!.addEventListener('click', () => goToStep(3))
  document.getElementById('oc-step4-launch')!.addEventListener('click', () => finishOnboarding())
}

function microappCard(m: { id: string; icon: string; name: string; desc: string; recommended?: boolean; dashed?: boolean; color: string }): string {
  const sel = state.microapps.includes(m.id) ? ' oc-sel' : ''
  return `
    <div class="oc-ma-card${sel}${m.dashed ? ' oc-dashed' : ''}" data-id="${m.id}">
      ${m.recommended ? '<div class="oc-ma-recommended">Recommended</div>' : ''}
      <div class="oc-ma-icon" style="background:${m.color};">${m.icon}</div>
      <div class="oc-ma-name">${m.name}</div>
      <div class="oc-ma-desc">${m.desc}</div>
      <div class="oc-ma-check">✓</div>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Finish & Save
// ═══════════════════════════════════════════════════════════════════════════════

async function finishOnboarding(): Promise<void> {
  const btn = document.getElementById('oc-step4-launch') as HTMLButtonElement
  btn.disabled = true
  btn.innerHTML = '<div class="oc-spinner"></div> Saving...'

  const config: Partial<AppConfig> = {
    setupComplete: true,
    workspaceType: state.workspaceType,
    tools: state.tools,
    teamSize: state.teamSize,
    invites: state.invites,
    connectors: state.connectors,
    microapps: state.microapps,
    sandboxName: 'open-coot-default',
    provider: 'ollama',
    model: 'llama3.1:8b',
    configVersion: 1
  }

  await window.electronAPI.saveConfig(config)

  // Short delay then navigate to dashboard
  setTimeout(() => {
    navigateToDashboard(config as AppConfig)
  }, 600)
}
