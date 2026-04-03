import { BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'child_process'
import * as os from 'os'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { BootstrapEvent, BootstrapStage } from '../shared/types'
import { saveConfig } from './config-service'
import { getOpenClawUrl } from './openclaw-service'

function startOllamaDetached(): void {
  const proc = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })
  proc.unref()
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sendBootstrap(win: BrowserWindow, stage: BootstrapStage, status: BootstrapEvent['status'], message: string, progress: number): void {
  const event: BootstrapEvent = { stage, status, message, progress }
  win.webContents.send('bootstrap-progress', event)
}

function runShell(cmd: string, env?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const fullEnv = { ...process.env, ...env }
    const proc = spawn('bash', ['-l', '-c', cmd], { shell: false, env: fullEnv })
    proc.stdin?.end()

    proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

    // 10-minute overall timeout per command
    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error(`Command timed out after 600s: ${cmd.substring(0, 80)}`))
    }, 600000)

    proc.on('exit', (code) => {
      clearTimeout(timeout)
      // Small delay ensures stdout has time to flush if it is finishing gracefully
      setTimeout(() => resolve({ code: code ?? 1, stdout, stderr }), 50)
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

function runShellLong(cmd: string, win: BrowserWindow, stage: BootstrapStage, env?: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const fullEnv = { ...process.env, ...env }
    const proc = spawn('bash', ['-l', '-c', cmd], { shell: false, env: fullEnv })
    proc.stdin?.end()

    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim())
      for (const line of lines) {
        console.log(`[bootstrap:${stage}] ${line}`)
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim())
      for (const line of lines) {
        console.log(`[bootstrap:${stage}:stderr] ${line}`)
      }
    })

    // 15-minute timeout for long operations (model pull etc.)
    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error(`Command timed out: ${cmd.substring(0, 80)}`))
    }, 900000)

    proc.on('exit', (code) => {
      clearTimeout(timeout)
      // Small delay to ensure stdout has time to flush
      setTimeout(() => resolve(code ?? 1), 50)
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

// ── Bootstrap Steps ─────────────────────────────────────────────────────────

async function checkArchitecture(win: BrowserWindow): Promise<boolean> {
  sendBootstrap(win, 'arch-check', 'running', 'Checking system architecture...', 5)

  const arch = os.arch()
  console.log(`[bootstrap] Detected architecture: ${arch}`)

  if (arch !== 'arm64') {
    win.webContents.send('arch-unsupported', 'This version of OpenCoot supports Apple Silicon Macs (M1 or newer) only.')
    sendBootstrap(win, 'arch-check', 'error', 'Unsupported architecture', 5)
    return false
  }

  sendBootstrap(win, 'arch-check', 'done', 'Apple Silicon detected ✓', 10)
  return true
}

async function checkNemoclawInstalled(): Promise<boolean> {
  try {
    const result = await runShell('nemoclaw --version')
    return result.code === 0
  } catch {
    return false
  }
}

async function installNemoclaw(win: BrowserWindow): Promise<boolean> {
  sendBootstrap(win, 'nemoclaw-install', 'running', 'Installing NemoClaw...', 20)

  try {
    const code = await runShellLong(
      'curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash',
      win,
      'nemoclaw-install',
      {
        NEMOCLAW_NON_INTERACTIVE: '1',
        NEMOCLAW_PROVIDER: 'ollama'
      }
    )

    if (code === 0) {
      sendBootstrap(win, 'nemoclaw-install', 'done', 'NemoClaw installed ✓', 25)
      return true
    } else {
      sendBootstrap(win, 'nemoclaw-install', 'error', `NemoClaw installation failed (exit ${code})`, 25)
      return false
    }
  } catch (err) {
    sendBootstrap(win, 'nemoclaw-install', 'error', `NemoClaw install error: ${(err as Error).message}`, 25)
    return false
  }
}

async function installOpenShell(win: BrowserWindow): Promise<boolean> {
  sendBootstrap(win, 'nemoclaw-install', 'running', 'Pre-installing OpenShell...', 23)

  try {
    const code = await runShellLong(
      'mkdir -p ~/.npm-global/bin ~/.local/bin && export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH" && curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh',
      win,
      'nemoclaw-install'
    )

    if (code === 0) {
      return true
    } else {
      console.error('[bootstrap] OpenShell installation failed')
      // Note: we don't necessarily abort the whole process here, but we return false
      return false
    }
  } catch (err) {
    console.error(`[bootstrap] OpenShell install error: ${(err as Error).message}`)
    return false
  }
}

async function checkDocker(): Promise<boolean> {
  try {
    const result = await runShell('docker info')
    return result.code === 0
  } catch {
    return false
  }
}

function waitForDockerRetry(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    sendBootstrap(win, 'docker-waiting', 'running', 'Waiting for Docker Desktop (up to 2 minutes)...', 35)

    let attempts = 0
    const maxAttempts = 24 // 24 × 5s = 2 minutes

    const interval = setInterval(async () => {
      attempts++
      const available = await checkDocker()

      if (available) {
        clearInterval(interval)
        sendBootstrap(win, 'docker-check', 'done', 'Docker Desktop detected ✓', 40)
        resolve(true)
      } else if (attempts >= maxAttempts) {
        clearInterval(interval)
        sendBootstrap(win, 'docker-waiting', 'error', 'Docker did not start in time. Please open Docker Desktop and click Retry.', 35)
        resolve(false)
      } else {
        sendBootstrap(win, 'docker-waiting', 'running', `Waiting for Docker Desktop... (${attempts}/${maxAttempts})`, 35)
      }
    }, 5000)
  })
}

async function checkOllamaInstalled(): Promise<boolean> {
  try {
    const result = await runShell('ollama list')
    return result.code === 0
  } catch {
    return false
  }
}

async function installOllama(win: BrowserWindow): Promise<boolean> {
  sendBootstrap(win, 'ollama-install', 'running', 'Installing Ollama...', 50)

  try {
    const code = await runShellLong(
      'curl -fsSL https://ollama.com/install.sh | sh',
      win,
      'ollama-install'
    )

    if (code === 0) {
      sendBootstrap(win, 'ollama-install', 'done', 'Ollama installed ✓', 55)
      return true
    } else {
      sendBootstrap(win, 'ollama-install', 'error', `Ollama installation failed (exit ${code})`, 55)
      return false
    }
  } catch (err) {
    sendBootstrap(win, 'ollama-install', 'error', `Ollama install error: ${(err as Error).message}`, 55)
    return false
  }
}

async function startOllamaService(win: BrowserWindow): Promise<boolean> {
  sendBootstrap(win, 'ollama-serve', 'running', 'Starting Ollama service...', 58)

  try {
    // Check if already running
    const check = await runShell('curl -sf http://localhost:11434 > /dev/null 2>&1 && echo "running"')
    if (check.stdout.includes('running')) {
      sendBootstrap(win, 'ollama-serve', 'done', 'Ollama service already running ✓', 60)
      return true
    }

    // Try ollama serve first (deterministic, scriptable, headless-safe)
    console.log('[bootstrap] Starting ollama serve in background...')
    startOllamaDetached()

    // Wait up to 15s for the service to become available
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const ping = await runShell('curl -sf http://localhost:11434 > /dev/null 2>&1 && echo "ok"')
      if (ping.stdout.includes('ok')) {
        sendBootstrap(win, 'ollama-serve', 'done', 'Ollama service started ✓', 60)
        return true
      }
    }

    // Fallback: try macOS GUI app
    console.log('[bootstrap] ollama serve did not respond, trying GUI app...')
    await runShell('open -a Ollama 2>/dev/null')

    // Wait another 10s for GUI app to start
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const ping = await runShell('curl -sf http://localhost:11434 > /dev/null 2>&1 && echo "ok"')
      if (ping.stdout.includes('ok')) {
        sendBootstrap(win, 'ollama-serve', 'done', 'Ollama service started via app ✓', 60)
        return true
      }
    }

    sendBootstrap(win, 'ollama-serve', 'error', 'Ollama service did not start within 25 seconds', 60)
    return false
  } catch (err) {
    sendBootstrap(win, 'ollama-serve', 'error', `Failed to start Ollama: ${(err as Error).message}`, 60)
    return false
  }
}

// ── Credentials ─────────────────────────────────────────────────────────────

async function writeCredentials(win: BrowserWindow): Promise<boolean> {
  sendBootstrap(win, 'sandbox-create', 'running', 'Writing provider credentials...', 83)

  try {
    const homeDir = os.homedir()
    const credDir = join(homeDir, '.nemoclaw')
    const credPath = join(credDir, 'credentials.json')

    if (!existsSync(credDir)) {
      mkdirSync(credDir, { recursive: true })
    }

    const credentials = {
      provider: 'ollama',
      model: 'llama3:8b'
    }

    writeFileSync(credPath, JSON.stringify(credentials, null, 2), 'utf-8')
    console.log(`[bootstrap] Wrote credentials to ${credPath}`)
    return true
  } catch (err) {
    console.error('[bootstrap] Failed to write credentials:', err)
    sendBootstrap(win, 'sandbox-create', 'error', `Failed to write credentials: ${(err as Error).message}`, 83)
    return false
  }
}

async function checkModelExists(): Promise<boolean> {
  try {
    const result = await runShell('ollama list | grep llama3')
    return result.code === 0 && result.stdout.includes('llama3')
  } catch {
    return false
  }
}

async function pullModel(win: BrowserWindow): Promise<boolean> {
  sendBootstrap(win, 'model-pull', 'running', 'Downloading llama3:8b model (this may take a few minutes)...', 65)

  try {
    const code = await runShellLong('ollama pull llama3:8b', win, 'model-pull')

    if (code === 0) {
      sendBootstrap(win, 'model-pull', 'done', 'Model llama3:8b ready ✓', 80)
      return true
    } else {
      sendBootstrap(win, 'model-pull', 'error', `Model pull failed (exit ${code})`, 80)
      return false
    }
  } catch (err) {
    sendBootstrap(win, 'model-pull', 'error', `Model pull error: ${(err as Error).message}`, 80)
    return false
  }
}

async function createSandbox(win: BrowserWindow): Promise<boolean> {
  sendBootstrap(win, 'sandbox-create', 'running', 'Creating sandbox...', 85)

  try {
    // Generate a secure macOS native graphical password prompt for sudo
    const askPassPath = '/tmp/opencoot_askpass.sh'
    const askPassScript = `#!/bin/bash\nosascript -e 'tell application "SystemUIServer" to activate' -e 'tell application "SystemUIServer" to display dialog "Open-Coot requires administrator privileges to configure isolated sandbox networking (CoreDNS/Docker)." default answer "" with hidden answer with title "Authentication Required"' -e 'text returned of result'\n`
    writeFileSync(askPassPath, askPassScript, { mode: 0o755, encoding: 'utf-8' })

    const code = await runShellLong(
      `export SUDO_ASKPASS="${askPassPath}" && sudo -A -v && export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH" && nemoclaw onboard --non-interactive`,
      win,
      'sandbox-create',
      {
        NEMOCLAW_NON_INTERACTIVE: '1',
        NEMOCLAW_SANDBOX_NAME: 'open-coot-default',
        NEMOCLAW_PROVIDER: 'ollama',
        NEMOCLAW_MODEL: 'llama3:8b'
      }
    )

    if (code === 0) {
      sendBootstrap(win, 'sandbox-create', 'done', 'Sandbox "open-coot-default" created ✓', 95)
      return true
    } else {
      sendBootstrap(win, 'sandbox-create', 'error', `Sandbox creation failed (exit ${code})`, 95)
      return false
    }
  } catch (err) {
    sendBootstrap(win, 'sandbox-create', 'error', `Sandbox error: ${(err as Error).message}`, 95)
    return false
  }
}

// ── Main Bootstrap Runner ───────────────────────────────────────────────────

export async function runMacBootstrap(win: BrowserWindow): Promise<void> {
  console.log('[bootstrap] Starting macOS bootstrap...')

  try {
    // Step 1: Architecture check
    const archOk = await checkArchitecture(win)
    if (!archOk) return

    // Step 2: Docker
    sendBootstrap(win, 'docker-check', 'running', 'Checking for Docker...', 15)
    let dockerAvailable = await checkDocker()

    if (!dockerAvailable) {
      // Signal renderer to show Docker modal
      win.webContents.send('docker-missing')
      let success = await waitForDockerRetry(win)

      while (!success) {
        console.log('[bootstrap] Docker waiting timed out. Waiting for user to click Retry.')
        await new Promise<void>((resolve) => {
          ipcMain.handle('retry-docker', async () => {
            ipcMain.removeHandler('retry-docker')
            resolve()
          })
        })
        success = await waitForDockerRetry(win)
      }
    } else {
      sendBootstrap(win, 'docker-check', 'done', 'Docker Desktop detected ✓', 20)
    }

    // Step 3: Write credentials.json before NemoClaw install
    // This forces the official installer to use Ollama during its internal onboarding, bypassing API key requirements
    const credsWritten = await writeCredentials(win)
    if (!credsWritten) {
      sendBootstrap(win, 'error', 'error', 'Failed to write credentials.', 22)
      win.webContents.send('bootstrap-complete', false)
      return
    }

    // Step 4: NemoClaw & OpenShell pre-requisites
    sendBootstrap(win, 'nemoclaw-check', 'running', 'Checking for OpenShell...', 23)

    // Always ensure OpenShell is installed, even if NemoClaw is already installed
    // This is because previous runs might have failed to install it properly
    const hasOpenShell = await runShell('export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH" && openshell version')
    if (hasOpenShell.code !== 0) {
      await installOpenShell(win)
    }

    sendBootstrap(win, 'nemoclaw-check', 'running', 'Checking for NemoClaw...', 24)
    const hasNemoclaw = await checkNemoclawInstalled()

    if (hasNemoclaw) {
      sendBootstrap(win, 'nemoclaw-check', 'done', 'NemoClaw already installed ✓', 35)
    } else {
      sendBootstrap(win, 'nemoclaw-install', 'running', 'Installing NemoClaw...', 25)
      const installed = await installNemoclaw(win)
      if (!installed) {
        sendBootstrap(win, 'error', 'error', 'Failed to install NemoClaw. Please try again.', 35)
        win.webContents.send('bootstrap-complete', false)
        return
      }
    }

    // Step 5: Ollama
    sendBootstrap(win, 'ollama-check', 'running', 'Checking for Ollama...', 45)
    const hasOllama = await checkOllamaInstalled()

    if (hasOllama) {
      sendBootstrap(win, 'ollama-check', 'done', 'Ollama already installed ✓', 50)
    } else {
      const ollamaInstalled = await installOllama(win)
      if (!ollamaInstalled) {
        sendBootstrap(win, 'error', 'error', 'Failed to install Ollama. Please try again.', 55)
        win.webContents.send('bootstrap-complete', false)
        return
      }
    }

    // Step 5: Start Ollama service
    const serviceStarted = await startOllamaService(win)
    if (!serviceStarted) {
      sendBootstrap(win, 'error', 'error', 'Could not start Ollama service.', 60)
      win.webContents.send('bootstrap-complete', false)
      return
    }

    // Step 6: Verify Ollama daemon is responsive before model pull
    sendBootstrap(win, 'model-check', 'running', 'Verifying Ollama daemon...', 62)
    const daemonCheck = await runShell('ollama list')
    if (daemonCheck.code !== 0) {
      console.log('[bootstrap] Ollama daemon not responsive, restarting...')
      sendBootstrap(win, 'ollama-serve', 'running', 'Restarting Ollama service...', 62)
      startOllamaDetached()
      // Wait up to 10s for restart
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const ping = await runShell('ollama list')
        if (ping.code === 0) break
      }
    }

    // Now check/pull model
    sendBootstrap(win, 'model-check', 'running', 'Checking for llama3:8b model...', 64)
    const hasModel = await checkModelExists()

    if (hasModel) {
      sendBootstrap(win, 'model-check', 'done', 'Model llama3:8b already available ✓', 65)
    } else {
      const modelPulled = await pullModel(win)
      if (!modelPulled) {
        sendBootstrap(win, 'error', 'error', 'Failed to pull llama3:8b model.', 80)
        win.webContents.send('bootstrap-complete', false)
        return
      }
    }

    // Step 8: Create sandbox
    const sandboxCreated = await createSandbox(win)
    if (!sandboxCreated) {
      sendBootstrap(win, 'error', 'error', 'Failed to create sandbox.', 95)
      win.webContents.send('bootstrap-complete', false)
      return
    }

    // Step 9: Verify sandbox creation
    sendBootstrap(win, 'sandbox-create', 'running', 'Verifying sandbox creation...', 98)
    const verifySandbox = await runShell('export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH" && nemoclaw list')
    if (verifySandbox.code !== 0 || !verifySandbox.stdout.includes('open-coot-default')) {
      throw new Error("Sandbox creation failed")
    }

    // Done!
    sendBootstrap(win, 'sandbox-create', 'done', 'Sandbox verified ✓', 98)
    saveConfig({ setupComplete: true })

    sendBootstrap(win, 'complete', 'running', 'Waiting for OpenClaw UI to start...', 99)
    const url = await getOpenClawUrl('open-coot-default')
    
    if (url) {
      sendBootstrap(win, 'complete', 'done', 'OpenClaw is ready. Loading...', 100)
      // Small timeout to let the UI show complete status briefly
      setTimeout(() => {
        win.loadURL(url)
      }, 500)
    } else {
      sendBootstrap(win, 'error', 'error', 'OpenClaw service failed to respond in time.', 100)
      win.webContents.send('bootstrap-complete', false)
    }

  } catch (err) {
    console.error('[bootstrap] Fatal error:', err)
    sendBootstrap(win, 'error', 'error', `Unexpected error: ${(err as Error).message}`, 0)
    win.webContents.send('bootstrap-complete', false)
  }
}
