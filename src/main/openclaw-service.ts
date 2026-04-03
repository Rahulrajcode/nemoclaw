import { spawn } from 'child_process'
import * as http from 'http'

/**
 * Silently runs `nemoclaw <sandbox> start`
 */
export async function startOpenclawService(sandboxName: string): Promise<boolean> {
  console.log(`[OpenClaw] Silently starting sandbox: ${sandboxName}`)
  return new Promise((resolve) => {
    // We add ~/.local/bin and ~/.npm-global/bin to PATH in case they contain `nemoclaw`
    const cmd = `export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH" && nemoclaw ${sandboxName || 'open-coot-default'} start`
    
    const proc = spawn('bash', ['-l', '-c', cmd], { env: process.env })
    
    let errorOutput = ''
    proc.stderr?.on('data', (data) => {
      errorOutput += data.toString()
    })

    proc.stdout?.on('data', (data) => {
      console.log(`[OpenClaw Start] ${data.toString().trim()}`)
    })
    
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[OpenClaw] Started successfully`)
        resolve(true)
      } else {
        console.warn(`[OpenClaw] Start returned exit code: ${code}. It might already be running. Err: ${errorOutput}`)
        // We still resolve true to allow polling to try
        resolve(true)
      }
    })
    
    proc.on('error', (err) => {
      console.error(`[OpenClaw] Failed to execute start command: ${err.message}`)
      resolve(false)
    })
  })
}

/**
 * Polls the given URL with HTTP GETs until it receives a response or times out.
 */
export async function pollOpenclawReady(url: string = 'http://localhost:3000', timeoutMs: number = 60000): Promise<boolean> {
  const startTime = Date.now()
  console.log(`[OpenClaw] Polling ${url} until ready...`)
  
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval)
        console.error(`[OpenClaw] Polling timed out after ${timeoutMs}ms`)
        resolve(false)
        return
      }

      const req = http.get(url, (res) => {
        // Any response across HTTP means the web interface is listening
        clearInterval(interval)
        console.log(`[OpenClaw] Service is ready! Response status: ${res.statusCode}`)
        
        // Consume response data to free up memory
        res.on('data', () => {})
        res.on('end', () => resolve(true))
      })

      req.on('error', (_err) => {
        // Ignoring expected Connection Refused errors during startup
      })
      
      req.setTimeout(2000, () => {
        req.destroy()
      })
      
      req.end()
    }, 1500)
  })
}
