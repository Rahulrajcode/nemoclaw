import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc-handlers'
import { registerConfigHandlers, isFirstLaunch, getConfig, saveConfig } from './config-service'
import { runMacBootstrap } from './mac-bootstrap'
import { getOpenClawUrl } from './openclaw-service'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    resizable: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Register IPC handlers before window creation
registerIpcHandlers(() => mainWindow)
registerConfigHandlers()

app.whenReady().then(async () => {
  // Set application menu with Edit role so Cmd+C/V/X/A (mac) and Ctrl+C/V/X/A work
  // Required for frameless windows where the default menu is absent
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as const] : []),
    { role: 'editMenu' }
  ]))

  createWindow()

  // macOS: run bootstrap if first launch
  // The renderer will detect platform and show the appropriate UI.
  // Bootstrap runs in main process and sends events to renderer.
  if (process.platform === 'darwin' && mainWindow) {
    const firstLaunch = isFirstLaunch()
    if (firstLaunch) {
      // Give renderer ~500ms to load before starting bootstrap
      mainWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => {
          if (mainWindow) runMacBootstrap(mainWindow)
        }, 500)
      })
    } else {
      // Subsequent launch: load OpenClaw directly using saved URL
      console.log('[Main] Running subsequent launch sequence...')
      const config = getConfig()
      const sandboxName = config?.sandboxName || 'open-coot-default'
      const savedUrl = config?.openclawUrl
      
      if (savedUrl) {
        // Fast path: use the saved tokenized URL from first install
        console.log(`[Main] Using saved URL: ${savedUrl}`)
        if (mainWindow) {
          mainWindow.webContents.on('did-finish-load', () => {
            // Wait briefly for the "Waking up" screen to show, then navigate
            setTimeout(() => {
              if (mainWindow) mainWindow.loadURL(savedUrl)
            }, 300)
          })
        }
      } else {
        // Fallback: try to discover the URL dynamically
        console.log('[Main] No saved URL found, trying discovery...')
        getOpenClawUrl(sandboxName).then((url) => {
          if (url && mainWindow) {
            saveConfig({ openclawUrl: url })
            mainWindow.loadURL(url)
          } else if (mainWindow) {
            mainWindow.webContents.send('startup-error', 'OpenClaw service failed to start or respond.')
          }
        }).catch(err => {
          console.error('[Main] Error starting OpenClaw:', err)
          mainWindow?.webContents.send('startup-error', (err as Error).message)
        })
      }
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
