import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function runTextCommand(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      ...options,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeout ?? 60_000,
      killSignal: 'SIGKILL'
    })
    return result.stdout.trim()
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim().slice(0, 500) : ''
    const detail = stderr || (error?.killed ? 'timed out' : '')
    throw new Error(`${command} failed${detail ? `: ${detail}` : ''}`)
  }
}

export function waitForSpawn(child, label, timeoutMs = 5_000) {
  if (child.pid) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      child.off('spawn', onSpawn)
      child.off('error', onError)
    }
    const onSpawn = () => { cleanup(); resolve() }
    const onError = (error) => { cleanup(); reject(error) }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`${label} did not spawn after ${timeoutMs}ms`))
    }, timeoutMs)
    child.once('spawn', onSpawn)
    child.once('error', onError)
  })
}

export async function pollUntil(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const controller = new AbortController()
    const remaining = deadline - Date.now()
    const timer = setTimeout(() => controller.abort(), Math.min(1_000, remaining))
    try {
      if (await check(controller.signal)) return
    } catch (error) {
      if (error?.name !== 'AbortError') throw error
    } finally {
      clearTimeout(timer)
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)))
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`)
}

export function waitForExit(child, label, timeoutMs = 60_000) {
  if (child.exitCode !== null) {
    return child.exitCode === 0 ? Promise.resolve() : Promise.reject(new Error(`${label} exited ${child.exitCode}`))
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      child.off('error', onError)
      child.off('close', onClose)
    }
    const onError = (error) => { cleanup(); reject(error) }
    const onClose = (code) => {
      cleanup()
      code === 0 ? resolve() : reject(new Error(`${label} exited ${code}`))
    }
    const timer = setTimeout(() => {
      cleanup()
      child.kill('SIGKILL')
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.once('error', onError)
    child.once('close', onClose)
  })
}

function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('process close timed out')), timeoutMs)
    child.once('close', () => { clearTimeout(timer); resolve() })
  })
}

export async function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  try {
    await waitForClose(child, 3_000)
  } catch {
    child.kill('SIGKILL')
    await waitForClose(child, 3_000)
  }
}
