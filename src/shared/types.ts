export interface SystemCheckResult {
  id: string
  name: string
  status: 'pass' | 'fail' | 'warn'
  value: string
  message: string
  fixUrl?: string
  fixCommand?: string
}

export interface SystemCheckResponse {
  platform: NodeJS.Platform
  checks: SystemCheckResult[]
  allPassed: boolean
}

export interface InstallConfig {
  provider: 'nvidia' | 'openai' | 'anthropic' | 'gemini' | 'ollama'
  providerLabel: string
  apiKey: string
  sandboxName: string
  modelName: string
}

export interface InstallOutputEvent {
  line: string
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'success' | 'debug'
}

export interface InstallCompleteEvent {
  success: boolean
  code: number | null
  message: string
}

// ── open-coot config & bootstrap types ──────────────────────────────────────

export interface AppConfig {
  setupComplete: boolean
  openclawUrl?: string  // Tokenized URL from first install, e.g. http://127.0.0.1:18789/#token=...
  workspaceType: string
  tools: string[]
  teamSize: string
  connectors: Record<string, boolean>
  microapps: string[]
  invites: InviteEntry[]
  sandboxName: string
  provider: string
  model: string
  configVersion: number
}

export interface InviteEntry {
  email: string
  role: 'admin' | 'member' | 'viewer'
}

export type BootstrapStage =
  | 'arch-check'
  | 'nemoclaw-check'
  | 'nemoclaw-install'
  | 'docker-check'
  | 'docker-waiting'
  | 'ollama-check'
  | 'ollama-install'
  | 'ollama-serve'
  | 'model-check'
  | 'model-pull'
  | 'sandbox-create'
  | 'complete'
  | 'error'

export interface BootstrapEvent {
  stage: BootstrapStage
  status: 'running' | 'done' | 'error' | 'skipped'
  message: string
  progress: number // 0-100
}

// ── Electron API ────────────────────────────────────────────────────────────

export interface ElectronAPI {
  // Existing wizard APIs
  checkSystemRequirements: () => Promise<SystemCheckResponse>
  validateApiKey: (provider: string, apiKey: string) => Promise<{ valid: boolean; message?: string }>
  runInstall: (config: InstallConfig) => Promise<void>
  cancelInstall: () => Promise<void>
  onInstallOutput: (callback: (event: InstallOutputEvent) => void) => void
  onInstallComplete: (callback: (event: InstallCompleteEvent) => void) => void
  removeInstallListeners: () => void
  openExternalLink: (url: string) => Promise<void>
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  getPlatform: () => string

  // Config APIs
  getConfig: () => Promise<AppConfig | null>
  saveConfig: (config: Partial<AppConfig>) => Promise<void>
  isFirstLaunch: () => Promise<boolean>

  // Bootstrap APIs (macOS)
  onBootstrapProgress: (callback: (event: BootstrapEvent) => void) => void
  onDockerMissing: (callback: () => void) => void
  onArchUnsupported: (callback: (message: string) => void) => void
  onBootstrapComplete: (callback: (success: boolean) => void) => void
  removeBootstrapListeners: () => void
  retryDocker: () => Promise<void>
  openDockerDownload: () => Promise<void>

  // Recovery APIs
  onStartupError: (callback: (message: string) => void) => void
  restartOpenClaw: () => Promise<void>
  openLogs: () => Promise<void>
  resetSetup: () => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
