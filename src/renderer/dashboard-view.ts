/**
 * Dashboard View — open-coot main dashboard (macOS).
 * Renders placeholder data for now. Real runtime integration comes later.
 */

import type { AppConfig } from '../shared/types'

export function renderDashboard(container: HTMLElement, config: AppConfig | null): void {
  const sandboxName = config?.sandboxName || 'open-coot-default'
  const provider = config?.provider || 'ollama'
  const model = config?.model || 'llama3.1:8b'
  const selectedMicroapps = config?.microapps || []

  container.innerHTML = `
    <div class="oc-dashboard">
      <div class="oc-window-chrome">
        <div class="oc-traffic-lights">
          <div class="oc-tl oc-tl-red"></div>
          <div class="oc-tl oc-tl-yellow"></div>
          <div class="oc-tl oc-tl-green"></div>
        </div>
        <div class="oc-window-title">open-coot</div>
        <div style="width:52px;"></div>
      </div>

      <div class="oc-dash-wrap">
        <!-- Sidebar -->
        <aside class="oc-dash-sidebar">
          <div class="oc-sidebar-logo">
            <div class="oc-sidebar-logo-mark">OC</div>
            <div class="oc-sidebar-logo-text">
              <h3>open-coot</h3>
              <p>powered by nemoclaw</p>
            </div>
          </div>

          <nav class="oc-sidebar-nav">
            <div class="oc-nav-group">
              <div class="oc-nav-group-label">Workspace</div>
              <div class="oc-nav-item oc-active"><span class="oc-nav-icon">⊞</span> Dashboard</div>
              <div class="oc-nav-item"><span class="oc-nav-icon">⟳</span> Workflows <span class="oc-nav-badge">12</span></div>
              <div class="oc-nav-item"><span class="oc-nav-icon">⚡</span> Runs</div>
            </div>
            <div class="oc-nav-group">
              <div class="oc-nav-group-label">Sources</div>
              <div class="oc-nav-item"><span class="oc-nav-icon">🔌</span> Connectors</div>
              <div class="oc-nav-item"><span class="oc-nav-icon">🧠</span> Knowledge</div>
            </div>
            <div class="oc-nav-group">
              <div class="oc-nav-group-label">Microapps</div>
              ${selectedMicroapps.includes('finance') ? '<div class="oc-nav-item"><span class="oc-nav-icon">💰</span> Finance</div>' : ''}
              ${selectedMicroapps.includes('knowledge') ? '<div class="oc-nav-item"><span class="oc-nav-icon">🧠</span> Knowledge Base</div>' : ''}
              ${selectedMicroapps.includes('projects') ? '<div class="oc-nav-item"><span class="oc-nav-icon">📋</span> Projects</div>' : ''}
              ${selectedMicroapps.includes('hr') ? '<div class="oc-nav-item"><span class="oc-nav-icon">👥</span> HR</div>' : ''}
              ${selectedMicroapps.includes('support') ? '<div class="oc-nav-item"><span class="oc-nav-icon">💬</span> Support</div>' : ''}
            </div>
            <div class="oc-nav-group">
              <div class="oc-nav-group-label">People</div>
              <div class="oc-nav-item"><span class="oc-nav-icon">👥</span> Team</div>
              <div class="oc-nav-item"><span class="oc-nav-icon">⚙</span> Settings</div>
            </div>
          </nav>

          <div class="oc-sidebar-llm">
            <div class="oc-llm-dot"></div>
            <div class="oc-llm-info">
              <h4>${model} · Running</h4>
              <p>Local · ${provider}</p>
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <div class="oc-dash-main">
          <div class="oc-dash-topbar">
            <div class="oc-dash-topbar-title">Dashboard</div>
            <div class="oc-dash-topbar-actions">
              <button class="oc-topbar-btn">+ New Workflow</button>
              <div class="oc-topbar-avatar">P</div>
            </div>
          </div>

          <div class="oc-dash-content">
            <!-- Stats -->
            <div class="oc-stats-grid">
              <div class="oc-stat-card">
                <div class="oc-stat-accent" style="background:var(--oc-primary);"></div>
                <div class="oc-stat-value">12</div>
                <div class="oc-stat-label">Active Workflows</div>
                <div class="oc-stat-trend" style="color:var(--oc-primary-light);">↑ +3 this week</div>
              </div>
              <div class="oc-stat-card">
                <div class="oc-stat-accent" style="background:var(--oc-success);"></div>
                <div class="oc-stat-value">247</div>
                <div class="oc-stat-label">Runs Today</div>
                <div class="oc-stat-trend" style="color:var(--oc-success);">99.2% success rate</div>
              </div>
              <div class="oc-stat-card">
                <div class="oc-stat-accent" style="background:var(--oc-warning);"></div>
                <div class="oc-stat-value">${Object.keys(config?.connectors || {}).length || 1}</div>
                <div class="oc-stat-label">Connectors</div>
                <div class="oc-stat-trend" style="color:var(--oc-warning);">Active</div>
              </div>
              <div class="oc-stat-card">
                <div class="oc-stat-accent" style="background:var(--oc-purple);"></div>
                <div class="oc-stat-value">${(config?.invites?.length || 0) + 1}</div>
                <div class="oc-stat-label">Team Members</div>
                <div class="oc-stat-trend" style="color:var(--oc-purple);">Online</div>
              </div>
            </div>

            <!-- Two-column layout -->
            <div class="oc-dash-grid">
              <!-- Workflows panel -->
              <div class="oc-dash-panel">
                <div class="oc-panel-header">
                  <span class="oc-panel-title">Recent Workflows</span>
                  <span class="oc-panel-link">View all →</span>
                </div>
                <div class="oc-wf-row">
                  <span class="oc-status-dot oc-running"></span>
                  <div class="oc-wf-info">
                    <div class="oc-wf-name">Daily finance summary</div>
                    <div class="oc-wf-meta">Scheduled 7:00 AM daily · Last run 2h ago</div>
                  </div>
                  <span class="oc-wf-runs">48 runs</span>
                </div>
                <div class="oc-wf-row">
                  <span class="oc-status-dot oc-running"></span>
                  <div class="oc-wf-info">
                    <div class="oc-wf-name">Slack → Notion digest</div>
                    <div class="oc-wf-meta">Triggered on message · 12 min ago</div>
                  </div>
                  <span class="oc-wf-runs">127 runs</span>
                </div>
                <div class="oc-wf-row">
                  <span class="oc-status-dot oc-idle"></span>
                  <div class="oc-wf-info">
                    <div class="oc-wf-name">Invoice parser</div>
                    <div class="oc-wf-meta">Waiting for Google Drive trigger</div>
                  </div>
                  <span class="oc-wf-runs">22 runs</span>
                </div>
                <div class="oc-wf-row">
                  <span class="oc-status-dot oc-running"></span>
                  <div class="oc-wf-info">
                    <div class="oc-wf-name">Weekly team report</div>
                    <div class="oc-wf-meta">Every Friday 5 PM · Next run in 2 days</div>
                  </div>
                  <span class="oc-wf-runs">8 runs</span>
                </div>
              </div>

              <!-- Right column -->
              <div class="oc-dash-right-col">
                <!-- Runtime Status -->
                <div class="oc-dash-panel">
                  <div class="oc-panel-header">
                    <span class="oc-panel-title">Runtime Status</span>
                  </div>
                  <div class="oc-cp-row">
                    <span class="oc-cp-icon">🐳</span>
                    <div class="oc-cp-info">
                      <div class="oc-cp-name">Sandbox</div>
                      <div class="oc-cp-meta">${sandboxName}</div>
                    </div>
                    <span class="oc-cp-badge" style="color:var(--oc-success);">● Running</span>
                  </div>
                  <div class="oc-cp-row">
                    <span class="oc-cp-icon">🦙</span>
                    <div class="oc-cp-info">
                      <div class="oc-cp-name">Provider</div>
                      <div class="oc-cp-meta">${provider} · ${model}</div>
                    </div>
                    <span class="oc-cp-badge" style="color:var(--oc-success);">● Active</span>
                  </div>
                </div>

                <!-- Connectors -->
                <div class="oc-dash-panel">
                  <div class="oc-panel-header">
                    <span class="oc-panel-title">Connectors</span>
                    <span class="oc-panel-link">Manage →</span>
                  </div>
                  ${Object.keys(config?.connectors || { 'local-files': true }).map(id => {
                    const names: Record<string, [string, string]> = {
                      'local-files': ['📁', 'Local Files'],
                      'google-drive': ['🔵', 'Google Drive'],
                      'slack': ['💬', 'Slack'],
                      'notion': ['📓', 'Notion'],
                      'github': ['🐙', 'GitHub'],
                      'onedrive': ['☁️', 'OneDrive']
                    }
                    const [icon, name] = names[id] || ['🔌', id]
                    return `
                      <div class="oc-cp-row">
                        <span class="oc-cp-icon">${icon}</span>
                        <div class="oc-cp-info">
                          <div class="oc-cp-name">${name}</div>
                          <div class="oc-cp-meta">Connected</div>
                        </div>
                        <span class="oc-cp-badge" style="color:var(--oc-success);">● Active</span>
                      </div>
                    `
                  }).join('')}
                </div>

                <!-- Active Microapps -->
                ${selectedMicroapps.length > 0 ? `
                <div class="oc-dash-panel">
                  <div class="oc-panel-header">
                    <span class="oc-panel-title">Active Microapps</span>
                    <span class="oc-panel-link">Add more →</span>
                  </div>
                  ${selectedMicroapps.map(id => {
                    const appsMap: Record<string, [string, string]> = {
                      'finance': ['💰', 'Finance Tracker'],
                      'knowledge': ['🧠', 'Knowledge Base'],
                      'projects': ['📋', 'Project Manager'],
                      'hr': ['👥', 'HR Assistant'],
                      'support': ['💬', 'Customer Support'],
                      'custom': ['⚙️', 'Custom Microapp']
                    }
                    const [icon, name] = appsMap[id] || ['⚙️', id]
                    return `
                      <div class="oc-cp-row">
                        <span class="oc-cp-icon">${icon}</span>
                        <div class="oc-cp-info">
                          <div class="oc-cp-name">${name}</div>
                          <div class="oc-cp-meta">Running</div>
                        </div>
                        <span class="oc-cp-badge" style="color:var(--oc-success);">● Running</span>
                      </div>
                    `
                  }).join('')}
                </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}
