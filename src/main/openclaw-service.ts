import { spawn, ChildProcess, execSync } from 'child_process'

let connectionProcess: ChildProcess | null = null

const PATH_PREFIX = 'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"'

// Matches the full tokenized URL: http://127.0.0.1:PORT/#token=HEX
const TOKEN_URL_RE = /(http:\/\/127\.0\.0\.1:\d+\/#token=[a-fA-F0-9]+)/

/**
 * Simple shell exec that returns stdout or throws.
 */
function runCmd(cmd: string, timeoutMs = 15000): string {
  try {
    return execSync(`bash -l -c '${cmd}'`, {
      timeout: timeoutMs,
      env: process.env,
      encoding: 'utf-8'
    }).trim()
  } catch (err) {
    throw new Error(`Command failed: ${cmd} — ${(err as Error).message}`)
  }
}

/**
 * Async shell exec with separate stdout/stderr capture.
 */
function runShellAsync(cmd: string, timeoutMs = 30000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn('bash', ['-l', '-c', cmd], { env: process.env })
    proc.stdin?.end()

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`Timed out after ${timeoutMs}ms: ${cmd.substring(0, 80)}`))
    }, timeoutMs)

    proc.on('exit', (code) => {
      clearTimeout(timer)
      setTimeout(() => resolve({ code: code ?? 1, stdout, stderr }), 50)
    })
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

/**
 * Pre-flight: make sure Docker is running and the sandbox is alive.
 */
async function ensureServicesRunning(_sandboxName: string): Promise<void> {
  // 1. Check Docker
  console.log('[OpenClaw Preflight] Checking Docker...')
  try {
    runCmd('docker info > /dev/null 2>&1')
    console.log('[OpenClaw Preflight] Docker is running')
  } catch {
    console.log('[OpenClaw Preflight] Docker not running — attempting to start...')
    try { execSync('open -a Docker', { timeout: 5000 }) } catch { /* ignore */ }

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        runCmd('docker info > /dev/null 2>&1')
        console.log('[OpenClaw Preflight] Docker started')
        break
      } catch {
        if (i === 14) throw new Error('Docker Desktop failed to start after 30 seconds.')
      }
    }
  }

  // 2. Ensure Ollama is running
  console.log('[OpenClaw Preflight] Ensuring Ollama is running...')
  try {
    runCmd('curl -sf http://localhost:11434 > /dev/null 2>&1')
    console.log('[OpenClaw Preflight] Ollama already running')
  } catch {
    console.log('[OpenClaw Preflight] Starting Ollama...')
    try {
      const proc = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })
      proc.unref()
      await new Promise(r => setTimeout(r, 3000))
    } catch { /* ignore */ }
  }

  // 3. Stop any stale openshell forwards so connect can start fresh
  console.log('[OpenClaw Preflight] Cleaning up stale forwards...')
  try {
    const listResult = await runShellAsync(`${PATH_PREFIX} && openshell forward list`, 10000)
    // Parse space-separated table: SANDBOX BIND PORT PID STATUS
    const lines = listResult.stdout.split('\n').filter(l => l.trim() && !l.startsWith('SANDBOX'))
    for (const line of lines) {
      const cols = line.trim().split(/\s+/)
      if (cols.length >= 3) {
        const fwdSandbox = cols[0]
        const fwdPort = cols[2]
        console.log(`[OpenClaw Preflight] Stopping stale forward on port ${fwdPort} for ${fwdSandbox}`)
        try {
          await runShellAsync(`${PATH_PREFIX} && openshell forward stop ${fwdPort} ${fwdSandbox}`, 5000)
        } catch { /* ignore */ }
      }
    }
  } catch {
    console.log('[OpenClaw Preflight] No forwards to clean up')
  }
}

// ── Strategy 1: `nemoclaw connect` — the primary way to start the UI ─────

function tryNemoclawConnect(sandboxName: string, timeoutMs = 60000): Promise<string | null> {
  return new Promise((resolve) => {
    if (connectionProcess) {
      connectionProcess.kill()
      connectionProcess = null
    }

    const cmd = `${PATH_PREFIX} && nemoclaw ${sandboxName} connect`
    console.log(`[OpenClaw Strategy 1] Spawning: ${cmd}`)
    console.log(`[OpenClaw Strategy 1] Waiting up to ${timeoutMs / 1000}s for URL...`)

    connectionProcess = spawn('bash', ['-l', '-c', cmd], { env: process.env })
    connectionProcess.stdin?.end()

    let resolved = false
    let allOutput = ''

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        console.log(`[OpenClaw Strategy 1] Timed out after ${timeoutMs / 1000}s`)
        console.log(`[OpenClaw Strategy 1] Collected output:\n${allOutput}`)
        // Don't kill the process — let it keep running in background,
        // it may still be starting up and we can try other strategies
        resolve(null)
      }
    }, timeoutMs)

    function handleOutput(data: Buffer, streamName: string): void {
      const text = data.toString()
      allOutput += text
      console.log(`[OpenClaw Strategy 1 ${streamName}] ${text.trim()}`)
      if (resolved) return

      const match = text.match(TOKEN_URL_RE)
      if (match) {
        resolved = true
        clearTimeout(timeout)
        console.log(`[OpenClaw Strategy 1] Found URL: ${match[1]}`)
        resolve(match[1])
      }
    }

    connectionProcess.stdout?.on('data', (d) => handleOutput(d, 'stdout'))
    connectionProcess.stderr?.on('data', (d) => handleOutput(d, 'stderr'))

    connectionProcess.on('close', (code) => {
      console.log(`[OpenClaw Strategy 1] Process exited with code ${code}`)
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve(null)
      }
    })

    connectionProcess.on('error', (err) => {
      console.warn(`[OpenClaw Strategy 1] Error: ${err.message}`)
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve(null)
      }
    })
  })
}

// ── Strategy 2: Parse URL from `nemoclaw <sandbox> status` output ────────

async function tryStatusUrl(sandboxName: string): Promise<string | null> {
  console.log('[OpenClaw Strategy 2] Trying nemoclaw status for URL...')
  try {
    const result = await runShellAsync(`${PATH_PREFIX} && nemoclaw ${sandboxName} status`, 15000)
    const combined = result.stdout + '\n' + result.stderr

    const match = combined.match(TOKEN_URL_RE)
    if (match) {
      console.log(`[OpenClaw Strategy 2] Found URL in status: ${match[1]}`)
      return match[1]
    }
    console.log('[OpenClaw Strategy 2] No tokenized URL found in status output.')
    return null
  } catch (err) {
    console.warn(`[OpenClaw Strategy 2] Failed: ${(err as Error).message}`)
    return null
  }
}

// ── Strategy 3: openshell forward + Docker token extraction ──────────────

async function tryOpenshellForward(sandboxName: string): Promise<string | null> {
  console.log('[OpenClaw Strategy 3] Trying openshell forward + Docker token...')
  try {
    // Start a fresh forward (stale ones were cleaned up in pre-flight)
    console.log('[OpenClaw Strategy 3] Starting forward...')
    const startResult = await runShellAsync(
      `${PATH_PREFIX} && openshell forward start 18789 ${sandboxName}`, 15000
    )
    console.log(`[OpenClaw Strategy 3] Forward start stdout: ${startResult.stdout}`)
    console.log(`[OpenClaw Strategy 3] Forward start stderr: ${startResult.stderr}`)

    const startCombined = startResult.stdout + '\n' + startResult.stderr

    // Check for tokenized URL in start output
    const startUrlMatch = startCombined.match(TOKEN_URL_RE)
    if (startUrlMatch) {
      console.log(`[OpenClaw Strategy 3] Found URL in forward start: ${startUrlMatch[1]}`)
      return startUrlMatch[1]
    }

    // Forward started but no token in output — try to extract token from Docker
    const token = await extractTokenFromContainer(sandboxName)
    if (token) {
      const url = `http://127.0.0.1:18789/#token=${token}`
      console.log(`[OpenClaw Strategy 3] Constructed URL: ${url}`)
      return url
    }

    // Check if the forward is actually serving HTTP before returning base URL
    console.log('[OpenClaw Strategy 3] No token found, testing if port 18789 serves HTTP...')
    try {
      const httpCheck = await runShellAsync(
        'curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/ 2>/dev/null || true', 5000
      )
      const statusCode = httpCheck.stdout.trim()
      console.log(`[OpenClaw Strategy 3] HTTP check returned: ${statusCode}`)
      if (statusCode && statusCode !== '000') {
        return 'http://127.0.0.1:18789/'
      }
    } catch { /* ignore */ }

    console.log('[OpenClaw Strategy 3] Forward port not serving HTTP.')
    return null
  } catch (err) {
    console.warn(`[OpenClaw Strategy 3] Failed: ${(err as Error).message}`)
    return null
  }
}

/**
 * Try to extract the OpenClaw authentication token from the sandbox Docker container.
 */
async function extractTokenFromContainer(sandboxName: string): Promise<string | null> {
  console.log('[OpenClaw Token] Attempting to extract token from container...')

  const containerPatterns = [sandboxName, 'openclaw', 'nemoclaw', 'open-coot']

  for (const pattern of containerPatterns) {
    try {
      const psResult = await runShellAsync(
        `docker ps --filter "name=${pattern}" --format "{{.ID}} {{.Names}}"`, 5000
      )
      if (!psResult.stdout.trim()) continue

      const containerId = psResult.stdout.trim().split(/\s/)[0]
      console.log(`[OpenClaw Token] Found container: ${psResult.stdout.trim()}`)

      // Method A: Check env vars for token
      try {
        const envResult = await runShellAsync(
          `docker exec ${containerId} env 2>/dev/null`, 5000
        )
        const tokenPatterns = [
          /(?:OPENCLAW_TOKEN|TOKEN|JUPYTER_TOKEN|AUTH_TOKEN)=([a-fA-F0-9]+)/,
          /(?:NOTEBOOK_TOKEN|ACCESS_TOKEN)=([a-fA-F0-9]+)/
        ]
        for (const re of tokenPatterns) {
          const m = envResult.stdout.match(re)
          if (m) {
            console.log('[OpenClaw Token] Found token in env var')
            return m[1]
          }
        }
      } catch { /* container might not support exec */ }

      // Method B: Check docker logs for the token URL
      try {
        const logsResult = await runShellAsync(
          `docker logs --tail 100 ${containerId} 2>&1`, 10000
        )
        const urlMatch = logsResult.stdout.match(TOKEN_URL_RE)
        if (urlMatch) {
          const tokenFromUrl = urlMatch[1].match(/#token=([a-fA-F0-9]+)/)
          if (tokenFromUrl) {
            console.log('[OpenClaw Token] Found token in container logs')
            return tokenFromUrl[1]
          }
        }
      } catch { /* logs might not be available */ }

    } catch { /* container pattern not found */ }
  }

  // Method C: Check host-side NemoClaw config files for the token
  const hostPaths = [
    '$HOME/.nemoclaw/tokens.json',
    '$HOME/.nemoclaw/sandboxes.json',
    `$HOME/.nemoclaw/${sandboxName}/config.json`,
    '$HOME/.config/nemoclaw/config.json',
    `$HOME/.config/nemoclaw/${sandboxName}.json`
  ]
  for (const path of hostPaths) {
    try {
      const catResult = await runShellAsync(`cat ${path} 2>/dev/null`, 3000)
      if (catResult.stdout.trim()) {
        const tokenMatch = catResult.stdout.match(/"token"\s*:\s*"([a-fA-F0-9]+)"/)
        if (tokenMatch) {
          console.log(`[OpenClaw Token] Found token in ${path}`)
          return tokenMatch[1]
        }
      }
    } catch { /* file doesn't exist */ }
  }

  console.log('[OpenClaw Token] Could not find token anywhere.')
  return null
}

// ── Main export ──────────────────────────────────────────────────────────

/**
 * Full startup sequence: pre-flight checks, then try strategies
 * to obtain the OpenClaw URL. Returns the URL or null on failure.
 *
 * Strategy order:
 *   1. `nemoclaw connect` — the actual command that starts the web UI (60s timeout)
 *   2. `nemoclaw status` — may have the URL if already running
 *   3. `openshell forward` — port-forward + token extraction
 */
export async function getOpenClawUrl(sandboxName: string): Promise<string | null> {
  try {
    await ensureServicesRunning(sandboxName)
  } catch (err) {
    console.error(`[OpenClaw] Pre-flight failed: ${(err as Error).message}`)
    return null
  }

  // Strategy 1: nemoclaw connect — this is the primary command that boots the
  // web UI inside the sandbox and prints the tokenized URL. Give it 60s.
  const connectUrl = await tryNemoclawConnect(sandboxName, 60000)
  if (connectUrl) return connectUrl

  // Strategy 2: Parse URL from `nemoclaw status` (may already be running)
  const statusUrl = await tryStatusUrl(sandboxName)
  if (statusUrl) return statusUrl

  // Strategy 3: openshell forward + token extraction
  const forwardUrl = await tryOpenshellForward(sandboxName)
  if (forwardUrl) return forwardUrl

  console.error('[OpenClaw] All strategies failed to obtain a URL.')
  return null
}
