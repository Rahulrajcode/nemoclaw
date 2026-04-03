import { spawn, ChildProcess } from 'child_process'

let connectionProcess: ChildProcess | null = null

/**
 * Runs `nemoclaw <sandbox> connect` to establish a port forward and parses the tokenized URL.
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
    const timeout = setTimeout(() => {
      if (!urlFound) {
        connectionProcess?.kill()
        reject(new Error('Timed out waiting for OpenClaw connection URL.'))
      }
    }, 20000) // 20s timeout for port forwarding and token generation

    connectionProcess.stdout?.on('data', (data) => {
      const out = data.toString()
      console.log(`[OpenClaw Connect] ${out.trim()}`)
      
      const match = out.match(/(http:\/\/127\.0\.0\.1:\d+\/#token=[a-zA-Z0-9]+)/)
      if (match && !urlFound) {
        urlFound = true
        clearTimeout(timeout)
        resolve(match[1])
      }
    })

    connectionProcess.stderr?.on('data', (data) => {
      console.error(`[OpenClaw Connect Err] ${data.toString().trim()}`)
    })

    connectionProcess.on('close', (code) => {
      if (!urlFound) {
        clearTimeout(timeout)
        reject(new Error(`Connection process exited before URL was found (code ${code}).`))
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

