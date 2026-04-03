import { app, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { AppConfig } from '../shared/types'

const CONFIG_FILENAME = 'config.json'

function getConfigPath(): string {
  return join(app.getPath('userData'), CONFIG_FILENAME)
}

function defaultConfig(): AppConfig {
  return {
    setupComplete: false,
    workspaceType: '',
    tools: [],
    teamSize: '',
    connectors: {},
    microapps: [],
    invites: [],
    sandboxName: 'open-coot-default',
    provider: 'ollama',
    model: 'llama3.1:8b',
    configVersion: 1
  }
}

export function getConfig(): AppConfig | null {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) return null

  try {
    const raw = readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as AppConfig
  } catch {
    return null
  }
}

export function saveConfig(partial: Partial<AppConfig>): void {
  const configPath = getConfigPath()
  const dir = app.getPath('userData')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const existing = getConfig() || defaultConfig()
  const merged: AppConfig = { ...existing, ...partial }

  writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8')
}

export function isFirstLaunch(): boolean {
  const config = getConfig()
  return !config || !config.setupComplete
}

// ── IPC Registration ────────────────────────────────────────────────────────

export function registerConfigHandlers(): void {
  ipcMain.handle('get-config', async () => {
    return getConfig()
  })

  ipcMain.handle('save-config', async (_event, partial: Partial<AppConfig>) => {
    saveConfig(partial)
  })

  ipcMain.handle('is-first-launch', async () => {
    return isFirstLaunch()
  })
}
