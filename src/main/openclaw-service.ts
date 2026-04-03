import { spawn, ChildProcess, execSync } from 'child_process'

let connectionProcess: ChildProcess | null = null

// Matches the full tokenized URL: http://127.0.0.1:PORT/#token=HEX
const TOKEN_URL_RE = /(http:\/\/127\.0\.0\.1:\d+\/#token=[a-fA-F0-9]+)/
// Fallback: matches just the base URL without token fragment
const BASE_URL_RE = /(?:Access at|http):?\s*(http:\/\/127\.0\.0\.1:\d+)/

/**
 * Simple shell exec that returns stdout or throws.
 */
function runCmd(cmd: string): string {
  try {
    return execSync(`bash -l -c '${cmd}'`, { 
      timeout: 15000, 
      env: process.env,
      encoding: 'utf-8'
    }).trim()
  } catch (err) {
    throw new Error(`Command failed: ${cmd} — ${(err as Error).message}`)
  }
}

/**
 * Scans a chunk of output for the OpenClaw URL.
 */
function extractUrl(text: string): string | null {
  const tokenMatch = text.match(TOKEN_URL_RE)
  if (tokenMatch) return tokenMatch[1]
  const baseMatch = text.match(BASE_URL_RE)
  if (baseMatch) return baseMatch[1]
  return null
}

/**
 * Pre-flight: make sure Docker is running and the sandbox is alive 
 * before we attempt `connect` (which hangs forever if Docker is down).
 */
async function ensureServicesRunning(sandboxName: string): Promise<void> {
  const pathPrefix = 'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"'

  // 1. Check Docker
  console.log('[OpenClaw Preflight] Checking Docker...')
  try {
    runCmd('docker info > /dev/null 2>&1')
    console.log('[OpenClaw Preflight] Docker is running ✓')
  } catch {
    console.log('[OpenClaw Preflight] Docker not running — attempting to open Docker Desktop...')
    try {
      execSync('open -a Docker', { timeout: 5000 })
    } catch { /* ignore if already running */ }
    
    // Wait up to 30s for Docker to start
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        runCmd('docker info > /dev/null 2>&1')
        console.log('[OpenClaw Preflight] Docker started ✓')
        break
      } catch {
        if (i === 14) throw new Error('Docker Desktop failed to start after 30 seconds.')
      }
    }
  }

  // 2. Start Ollama (non-blocking, in case it's needed)
  console.log('[OpenClaw Preflight] Ensuring Ollama is running...')
  try {
    runCmd('curl -sf http://localhost:11434 > /dev/null 2>&1')
    console.log('[OpenClaw Preflight] Ollama already running ✓')
  } catch {
    console.log('[OpenClaw Preflight] Starting Ollama...')
    try {
      const proc = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })
      proc.unref()
      await new Promise(r => setTimeout(r, 3000))
    } catch { /* ignore */ }
  }

  // 3. Check sandbox status
  console.log('[OpenClaw Preflight] Checking sandbox status...')
  try {
    const status = runCmd(`${pathPrefix} && nemoclaw ${sandboxName} status`)
    console.log(`[OpenClaw Preflight] Sandbox status: ${status}`)
  } catch (err) {
    console.warn(`[OpenClaw Preflight] Could not get sandbox status: ${(err as Error).message}`)
    // Don't throw — connect might still work
  }
}

/**
 * Runs `nemoclaw <sandbox> connect` to establish a port forward and parses the tokenized URL.
 * Scans BOTH stdout AND stderr since the CLI outputs to both streams.
 */
function spawnConnection(sandboxName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (connectionProcess) {
      connectionProcess.kill()
      connectionProcess = null
    }

    const innerCmd = `export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH" && nemoclaw ${sandboxName || 'open-coot-default'} connect`
    // Wrap in `script` to force a pseudo-TTY — many CLI tools suppress output without a TTY
    const cmd = `script -q /dev/null bash -l -c '${innerCmd}'`
    console.log(`[OpenClaw] Spawning connection (with PTY): ${innerCmd}`)
    
    connectionProcess = spawn('bash', ['-c', cmd], { env: process.env })
    // Close stdin immediately — we don't need interactive input
    connectionProcess.stdin?.end()
    
    let urlFound = false
    let bestUrl: string | null = null
    
    const timeout = setTimeout(() => {
      if (!urlFound) {
        if (bestUrl) {
          urlFound = true
          resolve(bestUrl)
        } else {
          connectionProcess?.kill()
          reject(new Error('Timed out waiting for OpenClaw connection URL.'))
        }
      }
    }, 30000)

    function handleOutput(data: Buffer, streamName: string): void {
      const text = data.toString()
      console.log(`[OpenClaw Connect ${streamName}] ${text.trim()}`)
      
      if (urlFound) return
      
      const url = extractUrl(text)
      if (url) {
        if (TOKEN_URL_RE.test(url)) {
          urlFound = true
          clearTimeout(timeout)
          resolve(url)
        } else {
          bestUrl = url
        }
      }
    }

    connectionProcess.stdout?.on('data', (data) => handleOutput(data, 'stdout'))
    connectionProcess.stderr?.on('data', (data) => handleOutput(data, 'stderr'))

    connectionProcess.on('close', (code) => {
      if (!urlFound) {
        clearTimeout(timeout)
        if (bestUrl) {
          urlFound = true
          resolve(bestUrl)
        } else {
          reject(new Error(`Connection process exited before URL was found (code ${code}).`))
        }
      }
    })
  })
}

/**
 * Full startup sequence: pre-flight checks → connect → extract URL.
 * Auto-retries once on failure.
 */
export async function getOpenClawUrl(sandboxName: string): Promise<string | null> {
  try {
    await ensureServicesRunning(sandboxName)
  } catch (err) {
    console.error(`[OpenClaw] Pre-flight failed: ${(err as Error).message}`)
    return null
  }

  try {
    console.log('[OpenClaw] Attempt 1/2: Connecting to sandbox...')
    return await spawnConnection(sandboxName)
  } catch (err) {
    console.warn(`[OpenClaw] Attempt 1 failed: ${(err as Error).message}. Retrying...`)
    try {
      console.log('[OpenClaw] Attempt 2/2: Retrying connection...')
      return await spawnConnection(sandboxName)
    } catch (retryErr) {
      console.error(`[OpenClaw] Attempt 2 failed: ${(retryErr as Error).message}.`)
      return null
    }
  }
}

