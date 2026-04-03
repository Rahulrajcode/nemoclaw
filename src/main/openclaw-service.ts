import { spawn, ChildProcess } from 'child_process'

let connectionProcess: ChildProcess | null = null

// Matches the full tokenized URL: http://127.0.0.1:PORT/#token=HEX
const TOKEN_URL_RE = /(http:\/\/127\.0\.0\.1:\d+\/#token=[a-fA-F0-9]+)/
// Fallback: matches just the base URL without token fragment
const BASE_URL_RE = /(?:Access at|http):?\s*(http:\/\/127\.0\.0\.1:\d+)/

/**
 * Scans a chunk of output (from either stdout or stderr) for the OpenClaw URL.
 * Returns the URL if found, or null.
 */
function extractUrl(text: string): string | null {
  const tokenMatch = text.match(TOKEN_URL_RE)
  if (tokenMatch) return tokenMatch[1]
  const baseMatch = text.match(BASE_URL_RE)
  if (baseMatch) return baseMatch[1]
  return null
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

    const cmd = `export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH" && nemoclaw ${sandboxName || 'open-coot-default'} connect`
    console.log(`[OpenClaw] Spawning connection: ${cmd}`)
    
    connectionProcess = spawn('bash', ['-l', '-c', cmd], { env: process.env })
    
    let urlFound = false
    let bestUrl: string | null = null
    
    const timeout = setTimeout(() => {
      if (!urlFound) {
        // If we found a base URL but no token URL, use the base URL
        if (bestUrl) {
          urlFound = true
          resolve(bestUrl)
        } else {
          connectionProcess?.kill()
          reject(new Error('Timed out waiting for OpenClaw connection URL.'))
        }
      }
    }, 30000) // 30s timeout

    function handleOutput(data: Buffer, streamName: string): void {
      const text = data.toString()
      console.log(`[OpenClaw Connect ${streamName}] ${text.trim()}`)
      
      if (urlFound) return
      
      const url = extractUrl(text)
      if (url) {
        // If it's a full token URL, resolve immediately
        if (TOKEN_URL_RE.test(url)) {
          urlFound = true
          clearTimeout(timeout)
          resolve(url)
        } else {
          // Store as fallback — the token URL might come later
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
 * Attempts to connect to OpenClaw. If it fails, retries once. 
 * Resolves with the URL or null if all retries fail.
 */
export async function getOpenClawUrl(sandboxName: string): Promise<string | null> {
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

