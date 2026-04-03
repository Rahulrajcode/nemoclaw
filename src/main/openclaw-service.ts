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
async function ensureServicesRunning(sandboxName: string): Promise<void> {
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

  // 3. Log sandbox status (non-blocking)
  console.log('[OpenClaw Preflight] Checking sandbox status...')
  try {
    const status = runCmd(`${PATH_PREFIX} && nemoclaw ${sandboxName} status`)
    console.log(`[OpenClaw Preflight] Sandbox status:\n${status}`)
  } catch (err) {
    console.warn(`[OpenClaw Preflight] Could not get sandbox status: ${(err as Error).message}`)
  }
}

// ── Strategy 1: Parse URL from `nemoclaw <sandbox> status` output ──────────

async function tryStatusUrl(sandboxName: string): Promise<string | null> {
  console.log('[OpenClaw Strategy 1] Trying nemoclaw status for URL...')
  try {
    const result = await runShellAsync(`${PATH_PREFIX} && nemoclaw ${sandboxName} status`, 15000)
    const combined = result.stdout + '\n' + result.stderr
    console.log(`[OpenClaw Strategy 1] Status output:\n${combined}`)

    const match = combined.match(TOKEN_URL_RE)
    if (match) {
      console.log(`[OpenClaw Strategy 1] Found URL in status: ${match[1]}`)
      return match[1]
    }
    console.log('[OpenClaw Strategy 1] No tokenized URL found in status output.')
    return null
  } catch (err) {
    console.warn(`[OpenClaw Strategy 1] Failed: ${(err as Error).message}`)
    return null
  }
}

// ── Strategy 2: openshell forward + Docker token extraction ────────────────

async function tryOpenshellForward(sandboxName: string): Promise<string | null> {
  console.log('[OpenClaw Strategy 2] Trying openshell forward + Docker token...')
  try {
    // Check if a forward is already active
    const listResult = await runShellAsync(
      `${PATH_PREFIX} && openshell forward list`, 10000
    )
    console.log(`[OpenClaw Strategy 2] Forward list stdout: ${listResult.stdout}`)
    console.log(`[OpenClaw Strategy 2] Forward list stderr: ${listResult.stderr}`)

    // Look for a URL in the forward list output
    const listCombined = listResult.stdout + '\n' + listResult.stderr
    const listMatch = listCombined.match(TOKEN_URL_RE)
    if (listMatch) {
      console.log(`[OpenClaw Strategy 2] Found URL in forward list: ${listMatch[1]}`)
      return listMatch[1]
    }

    // Try to extract port from forward list (look for port numbers)
    const portMatch = listCombined.match(/(?:localhost|127\.0\.0\.1):(\d{4,5})/)
    let port = portMatch ? portMatch[1] : null

    // If no active forward, start one
    if (!port) {
      console.log('[OpenClaw Strategy 2] No active forward found, starting one...')
      const startResult = await runShellAsync(
        `${PATH_PREFIX} && openshell forward start 18789 ${sandboxName}`, 15000
      )
      console.log(`[OpenClaw Strategy 2] Forward start stdout: ${startResult.stdout}`)
      console.log(`[OpenClaw Strategy 2] Forward start stderr: ${startResult.stderr}`)

      const startCombined = startResult.stdout + '\n' + startResult.stderr

      // Check for URL in start output
      const startUrlMatch = startCombined.match(TOKEN_URL_RE)
      if (startUrlMatch) {
        console.log(`[OpenClaw Strategy 2] Found URL in forward start: ${startUrlMatch[1]}`)
        return startUrlMatch[1]
      }

      const startPortMatch = startCombined.match(/(?:localhost|127\.0\.0\.1):(\d{4,5})/)
      port = startPortMatch ? startPortMatch[1] : '18789'
    }

    // Now try to extract the token from the Docker container
    const token = await extractTokenFromContainer(sandboxName)
    if (token && port) {
      const url = `http://127.0.0.1:${port}/#token=${token}`
      console.log(`[OpenClaw Strategy 2] Constructed URL: ${url}`)
      return url
    }

    // If we have a port but no token, return the base URL as fallback
    if (port) {
      const url = `http://127.0.0.1:${port}/`
      console.log(`[OpenClaw Strategy 2] No token found, using base URL: ${url}`)
      return url
    }

    return null
  } catch (err) {
    console.warn(`[OpenClaw Strategy 2] Failed: ${(err as Error).message}`)
    return null
  }
}

/**
 * Try to extract the OpenClaw authentication token from the sandbox Docker container.
 * Checks environment variables and common config file locations.
 */
async function extractTokenFromContainer(sandboxName: string): Promise<string | null> {
  console.log('[OpenClaw Token] Attempting to extract token from container...')

  // Find the container name/id
  const containerPatterns = [sandboxName, `openclaw`, `nemoclaw`, `open-coot`]

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
        // Look for common token env var patterns
        const tokenPatterns = [
          /(?:OPENCLAW_TOKEN|TOKEN|JUPYTER_TOKEN|AUTH_TOKEN)=([a-fA-F0-9]+)/,
          /(?:NOTEBOOK_TOKEN|ACCESS_TOKEN)=([a-fA-F0-9]+)/
        ]
        for (const re of tokenPatterns) {
          const m = envResult.stdout.match(re)
          if (m) {
            console.log(`[OpenClaw Token] Found token in env var`)
            return m[1]
          }
        }
      } catch { /* container might not support exec */ }

      // Method B: Check common config file locations inside the container
      const configPaths = [
        '/root/.openclaw/config.json',
        '/home/openclaw/.openclaw/config.json',
        '/app/config.json',
        '/etc/openclaw/config.json'
      ]
      for (const path of configPaths) {
        try {
          const catResult = await runShellAsync(
            `docker exec ${containerId} cat ${path} 2>/dev/null`, 5000
          )
          if (catResult.stdout.trim()) {
            const tokenMatch = catResult.stdout.match(/"token"\s*:\s*"([a-fA-F0-9]+)"/)
            if (tokenMatch) {
              console.log(`[OpenClaw Token] Found token in ${path}`)
              return tokenMatch[1]
            }
          }
        } catch { /* file doesn't exist */ }
      }

      // Method C: Check docker logs for the token URL
      try {
        const logsResult = await runShellAsync(
          `docker logs --tail 100 ${containerId} 2>&1`, 10000
        )
        const urlMatch = logsResult.stdout.match(TOKEN_URL_RE)
        if (urlMatch) {
          // Extract just the token from the URL
          const tokenFromUrl = urlMatch[1].match(/#token=([a-fA-F0-9]+)/)
          if (tokenFromUrl) {
            console.log(`[OpenClaw Token] Found token in container logs`)
            return tokenFromUrl[1]
          }
        }
      } catch { /* logs might not be available */ }

      // Method D: Check for port mapping from this container
      try {
        const portResult = await runShellAsync(
          `docker port ${containerId}`, 5000
        )
        console.log(`[OpenClaw Token] Container port mapping: ${portResult.stdout.trim()}`)
      } catch { /* ignore */ }

    } catch { /* container pattern not found */ }
  }

  // Method E: Check host-side NemoClaw config files for the token
  const hostPaths = [
    '$HOME/.nemoclaw/tokens.json',
    '$HOME/.nemoclaw/sandboxes.json',
    `$HOME/.nemoclaw/${sandboxName}/config.json`,
    '$HOME/.config/nemoclaw/config.json',
    `$HOME/.config/nemoclaw/${sandboxName}.json`,
    '$HOME/.nemoclaw/credentials.json'
  ]
  for (const path of hostPaths) {
    try {
      const catResult = await runShellAsync(`cat ${path} 2>/dev/null`, 3000)
      if (catResult.stdout.trim()) {
        console.log(`[OpenClaw Token] Found host config: ${path} -> ${catResult.stdout.substring(0, 200)}`)
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

// ── Strategy 3: nemoclaw connect (improved, last resort) ───────────────────

function tryNemoclawConnect(sandboxName: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (connectionProcess) {
      connectionProcess.kill()
      connectionProcess = null
    }

    const cmd = `${PATH_PREFIX} && nemoclaw ${sandboxName} connect`
    console.log(`[OpenClaw Strategy 3] Spawning: ${cmd}`)

    // Try WITHOUT the `script` PTY wrapper first — it may be causing the exit code 1.
    // Some CLIs fail when `script` closes stdin or when the PTY behaves unexpectedly.
    connectionProcess = spawn('bash', ['-l', '-c', cmd], { env: process.env })
    connectionProcess.stdin?.end()

    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        connectionProcess?.kill()
        connectionProcess = null
        console.log('[OpenClaw Strategy 3] Timed out after 20s')
        resolve(null)
      }
    }, 20000)

    function handleOutput(data: Buffer, streamName: string): void {
      const text = data.toString()
      console.log(`[OpenClaw Strategy 3 ${streamName}] ${text.trim()}`)
      if (resolved) return

      const match = text.match(TOKEN_URL_RE)
      if (match) {
        resolved = true
        clearTimeout(timeout)
        console.log(`[OpenClaw Strategy 3] Found URL: ${match[1]}`)
        resolve(match[1])
      }
    }

    connectionProcess.stdout?.on('data', (d) => handleOutput(d, 'stdout'))
    connectionProcess.stderr?.on('data', (d) => handleOutput(d, 'stderr'))

    connectionProcess.on('close', (code) => {
      console.log(`[OpenClaw Strategy 3] Process exited with code ${code}`)
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve(null)
      }
    })

    connectionProcess.on('error', (err) => {
      console.warn(`[OpenClaw Strategy 3] Error: ${err.message}`)
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve(null)
      }
    })
  })
}

// ── Strategy 4: Docker logs + port mapping (no nemoclaw CLI needed) ────────

async function tryDockerDirect(sandboxName: string): Promise<string | null> {
  console.log('[OpenClaw Strategy 4] Trying direct Docker container inspection...')
  try {
    // Find containers related to this sandbox
    const psResult = await runShellAsync(
      `docker ps --format "{{.ID}}\\t{{.Names}}\\t{{.Ports}}"`, 5000
    )
    console.log(`[OpenClaw Strategy 4] Docker ps:\n${psResult.stdout}`)

    const lines = psResult.stdout.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const lowerLine = line.toLowerCase()
      if (lowerLine.includes(sandboxName) || lowerLine.includes('openclaw') ||
          lowerLine.includes('nemoclaw') || lowerLine.includes('open-coot')) {

        const parts = line.split('\t')
        const containerId = parts[0]

        // Extract host port from the ports column (e.g., "0.0.0.0:18789->8080/tcp")
        // Skip known non-HTTP container ports (gRPC, etc.)
        const portsCol = parts[2] || ''
        const NON_HTTP_CONTAINER_PORTS = ['30051', '50051', '9090']
        const allPortMappings = [...portsCol.matchAll(/0\.0\.0\.0:(\d+)->(\d+)\/tcp/g)]
        // Prefer mappings where the container port is HTTP-like, skip gRPC ports
        const httpMapping = allPortMappings.find(m => !NON_HTTP_CONTAINER_PORTS.includes(m[2]))
          || allPortMappings.find(m => !m) // no fallback — if all are non-HTTP, skip
        const port = httpMapping ? httpMapping[1] : null

        if (!port) continue

        console.log(`[OpenClaw Strategy 4] Found container ${containerId} on port ${port}`)

        // Get token from container logs
        const logsResult = await runShellAsync(
          `docker logs --tail 200 ${containerId} 2>&1`, 10000
        )
        const urlMatch = logsResult.stdout.match(TOKEN_URL_RE)
        if (urlMatch) {
          // Replace the port in the URL with our mapped port if different
          console.log(`[OpenClaw Strategy 4] Found URL in logs: ${urlMatch[1]}`)
          return urlMatch[1]
        }

        // Try token from env
        const envResult = await runShellAsync(`docker exec ${containerId} env 2>/dev/null`, 5000)
        const tokenEnvMatch = envResult.stdout.match(/(?:TOKEN|JUPYTER_TOKEN|AUTH_TOKEN)=([a-fA-F0-9]+)/)
        if (tokenEnvMatch) {
          const url = `http://127.0.0.1:${port}/#token=${tokenEnvMatch[1]}`
          console.log(`[OpenClaw Strategy 4] Constructed URL from env: ${url}`)
          return url
        }

        // Fallback: just the base URL (might work if auth is disabled)
        console.log(`[OpenClaw Strategy 4] No token found, returning base URL on port ${port}`)
        return `http://127.0.0.1:${port}/`
      }
    }

    console.log('[OpenClaw Strategy 4] No matching container found.')
    return null
  } catch (err) {
    console.warn(`[OpenClaw Strategy 4] Failed: ${(err as Error).message}`)
    return null
  }
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Full startup sequence: pre-flight checks, then try multiple strategies
 * to obtain the OpenClaw URL. Returns the URL or null on failure.
 */
export async function getOpenClawUrl(sandboxName: string): Promise<string | null> {
  try {
    await ensureServicesRunning(sandboxName)
  } catch (err) {
    console.error(`[OpenClaw] Pre-flight failed: ${(err as Error).message}`)
    return null
  }

  // Strategy 1: Parse URL from `nemoclaw status`
  const statusUrl = await tryStatusUrl(sandboxName)
  if (statusUrl && TOKEN_URL_RE.test(statusUrl)) return statusUrl

  // Strategy 2: openshell forward + token extraction from Docker
  const forwardUrl = await tryOpenshellForward(sandboxName)
  if (forwardUrl && TOKEN_URL_RE.test(forwardUrl)) return forwardUrl

  // If Strategy 2 got a forwarded port URL (even without token), prefer it over
  // Docker direct — the forward is the correct HTTP entry point, while Docker
  // port mappings may expose gRPC or other non-HTTP services.
  if (forwardUrl) return forwardUrl

  // Strategy 3: nemoclaw connect (improved — no PTY wrapper)
  const connectUrl = await tryNemoclawConnect(sandboxName)
  if (connectUrl) return connectUrl

  // Strategy 4: Direct Docker inspection (logs + port mapping)
  const dockerUrl = await tryDockerDirect(sandboxName)
  if (dockerUrl) return dockerUrl

  if (statusUrl) return statusUrl

  console.error('[OpenClaw] All strategies failed to obtain a URL.')
  return null
}
