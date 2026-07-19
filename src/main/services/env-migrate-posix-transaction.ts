import {
  NODE_FAILED_TEMP_FS, quarantineOwnedFailedTemp,
  type FailedPathIdentity,
} from './env-migrate-failed-temp'
import {
  captureUserEnvPosix,
  restoreUserEnvPosix,
  setUserEnvPosix,
  unsetUserEnvPosix,
  type PosixEnvOptions,
  type PosixEnvTransactionState,
} from './env-migrate-posix'

type EnvSetter = (varName: string, value: string) => boolean
type EnvUnsetter = (varName: string) => boolean

export interface PosixTransactionAdapter {
  kind: 'posix'
  set: EnvSetter
  unset: EnvUnsetter
}

function restoreRuntime(state: PosixEnvTransactionState, options: PosixEnvOptions): void {
  const env = options.env ?? process.env
  if (state.runtimeExisted && state.runtimeValue !== undefined) {
    env[state.varName] = state.runtimeValue
  } else delete env[state.varName]
}

function archiveCreatedProfile(
  state: PosixEnvTransactionState,
  identity: FailedPathIdentity | null,
  options: PosixEnvOptions,
): boolean {
  if (!identity) return false
  const fs = options.fs ?? NODE_FAILED_TEMP_FS
  const archived = quarantineOwnedFailedTemp(state.target.path, {
    beforeRename: options.beforeArchiveRename,
    fs,
    sourceIdentity: identity,
  })
  if (!archived) return false
  restoreRuntime(state, options)
  return true
}

export function posixEnvTransactionAdapter(
  options: PosixEnvOptions,
): PosixTransactionAdapter {
  let state: PosixEnvTransactionState | null = null
  let createdIdentity: FailedPathIdentity | null = null
  const fs = options.fs ?? NODE_FAILED_TEMP_FS
  return {
    kind: 'posix',
    set: (varName, value) => {
      const captured = captureUserEnvPosix(varName, options)
      if (!captured || !setUserEnvPosix(varName, value, options)) return false
      state = captured
      createdIdentity = captured.target.existed ? null : fs.inspect(captured.target.path)
      return true
    },
    unset: (varName) => {
      if (!state || state.varName !== varName) return unsetUserEnvPosix(varName, options)
      const restored = state.target.existed
        ? restoreUserEnvPosix(state, options)
        : archiveCreatedProfile(state, createdIdentity, options)
      if (restored) {
        state = null
        createdIdentity = null
      }
      return restored
    },
  }
}
