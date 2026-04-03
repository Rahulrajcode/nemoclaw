import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, InstallConfig, InstallOutputEvent, InstallCompleteEvent, BootstrapEvent, AppConfig } from '../shared/types'

const api: ElectronAPI = {
  // ── Existing wizard APIs ────────────────────────────────────────────────
  checkSystemRequirements: () => ipcRenderer.invoke('check-system-requirements'),

  validateApiKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke('validate-api-key', provider, apiKey),

  runInstall: (config: InstallConfig) => ipcRenderer.invoke('run-install', config),

  cancelInstall: () => ipcRenderer.invoke('cancel-install'),

  onInstallOutput: (callback: (event: InstallOutputEvent) => void) => {
    ipcRenderer.on('install-output', (_event, data: InstallOutputEvent) => callback(data))
  },

  onInstallComplete: (callback: (event: InstallCompleteEvent) => void) => {
    ipcRenderer.on('install-complete', (_event, data: InstallCompleteEvent) => callback(data))
  },

  removeInstallListeners: () => {
    ipcRenderer.removeAllListeners('install-output')
    ipcRenderer.removeAllListeners('install-complete')
  },

  openExternalLink: (url: string) => ipcRenderer.invoke('open-external', url),

  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  getPlatform: () => process.platform,

  // ── Config APIs ─────────────────────────────────────────────────────────
  getConfig: () => ipcRenderer.invoke('get-config'),

  saveConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke('save-config', config),

  isFirstLaunch: () => ipcRenderer.invoke('is-first-launch'),

  // ── Bootstrap APIs (macOS) ──────────────────────────────────────────────
  onBootstrapProgress: (callback: (event: BootstrapEvent) => void) => {
    ipcRenderer.on('bootstrap-progress', (_event, data: BootstrapEvent) => callback(data))
  },

  onDockerMissing: (callback: () => void) => {
    ipcRenderer.on('docker-missing', () => callback())
  },

  onArchUnsupported: (callback: (message: string) => void) => {
    ipcRenderer.on('arch-unsupported', (_event, message: string) => callback(message))
  },

  onBootstrapComplete: (callback: (success: boolean) => void) => {
    ipcRenderer.on('bootstrap-complete', (_event, success: boolean) => callback(success))
  },

  removeBootstrapListeners: () => {
    ipcRenderer.removeAllListeners('bootstrap-progress')
    ipcRenderer.removeAllListeners('docker-missing')
    ipcRenderer.removeAllListeners('arch-unsupported')
    ipcRenderer.removeAllListeners('bootstrap-complete')
  },

  retryDocker: () => ipcRenderer.invoke('retry-docker'),
  openDockerDownload: () => ipcRenderer.invoke('open-docker-download'),

  // ── Recovery APIs ───────────────────────────────────────────────────────
  onStartupError: (callback: (message: string) => void) => {
    ipcRenderer.on('startup-error', (_event, message: string) => callback(message))
  },
  restartOpenClaw: () => ipcRenderer.invoke('restart-openclaw'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  resetSetup: () => ipcRenderer.invoke('reset-setup')
}

contextBridge.exposeInMainWorld('electronAPI', api)
