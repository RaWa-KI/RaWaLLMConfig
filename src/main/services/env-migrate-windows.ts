import { spawnSync } from 'node:child_process'

type EnvSetter = (varName: string, value: string) => boolean
type EnvUnsetter = (varName: string) => boolean

export type PersistentEnvState =
  | { exists: true; value: string }
  | { exists: false }

export interface WindowsEnvAdapterOptions {
  env?: NodeJS.ProcessEnv
  getPersistent?: (varName: string) => PersistentEnvState | null
  setPersistent?: EnvSetter
  unsetPersistent?: EnvUnsetter
}

export interface WindowsEnvAdapter {
  kind: 'windows'
  set: EnvSetter
  unset: EnvUnsetter
}

interface PreviousEnvState {
  runtimeExists: boolean
  runtimeValue?: string
  persistent: PersistentEnvState
}

function runPowerShell(script: string, input?: string) {
  return spawnSync(
    'powershell.exe',
    ['-NonInteractive', '-NoProfile', '-Command', script],
    {
      input,
      encoding: 'utf8',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      timeout: 10_000,
      windowsHide: true,
    },
  )
}

function getUserEnv(varName: string): PersistentEnvState | null {
  try {
    const script = `$value = [Environment]::GetEnvironmentVariable('${varName}', 'User'); if ($null -eq $value) { exit 3 }; [Console]::Out.Write($value)`
    const result = runPowerShell(script)
    if (result.error || (result.status !== 0 && result.status !== 3)) return null
    return result.status === 3
      ? { exists: false }
      : { exists: true, value: result.stdout ?? '' }
  } catch { return null }
}

function setUserEnv(varName: string, value: string): boolean {
  try {
    const script = `$val = [Console]::In.ReadToEnd(); [Environment]::SetEnvironmentVariable('${varName}', $val, 'User')`
    const result = runPowerShell(script, value)
    return result.status === 0 && !result.error
  } catch { return false }
}

function unsetUserEnv(varName: string): boolean {
  try {
    const script = `[Environment]::SetEnvironmentVariable('${varName}', $null, 'User')`
    const result = runPowerShell(script)
    return result.status === 0 && !result.error
  } catch { return false }
}

export function windowsEnvAdapter(
  options: WindowsEnvAdapterOptions = {},
): WindowsEnvAdapter {
  const env = options.env ?? process.env
  const getPersistent = options.getPersistent ?? getUserEnv
  const setPersistent = options.setPersistent ?? setUserEnv
  const unsetPersistent = options.unsetPersistent ?? unsetUserEnv
  const previous = new Map<string, PreviousEnvState>()
  return {
    kind: 'windows',
    set: (varName, value) => {
      const persistent = getPersistent(varName)
      if (!persistent) return false
      const before = {
        runtimeExists: Object.prototype.hasOwnProperty.call(env, varName),
        runtimeValue: env[varName],
        persistent,
      }
      if (!setPersistent(varName, value)) return false
      previous.set(varName, before)
      env[varName] = value
      return true
    },
    unset: (varName) => {
      const before = previous.get(varName)
      const reverted = before?.persistent.exists
        ? setPersistent(varName, before.persistent.value)
        : unsetPersistent(varName)
      if (!reverted) return false
      if (before?.runtimeExists && before.runtimeValue !== undefined) {
        env[varName] = before.runtimeValue
      } else delete env[varName]
      previous.delete(varName)
      return true
    },
  }
}
