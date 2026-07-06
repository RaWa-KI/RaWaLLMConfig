// app-paths.spec.ts — portable App-Schreibpfade ohne reale UserData-Mutation.
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  archiveRoot,
  auditPath,
  prefsPath,
  resolveDefaultArchiveRoot,
  setArchiveRootResolver,
  setUserDataRootResolver,
  userDataRoot
} from '../../src/main/services/app-paths'

function restoreEnv(key: string, oldValue: string | undefined): void {
  if (oldValue === undefined) delete process.env[key]
  else process.env[key] = oldValue
}

test('Sandbox-Root gewinnt fuer App-Pfade vor injiziertem userData', () => {
  const old = process.env.RAWALLM_SANDBOX_ROOT
  const sandbox = join(tmpdir(), 'rawallm-app-paths-sandbox')
  const injected = join(tmpdir(), 'rawallm-app-paths-userdata')
  try {
    process.env.RAWALLM_SANDBOX_ROOT = sandbox
    setUserDataRootResolver(() => injected)
    expect(userDataRoot()).toBe(sandbox)
    expect(archiveRoot()).toBe(join(sandbox, 'archive'))
    expect(auditPath()).toBe(join(sandbox, '.rawallmconfig', 'audit-log.ndjson'))
    expect(prefsPath()).toBe(join(sandbox, '.rawallmconfig', 'prefs.json'))
  } finally {
    restoreEnv('RAWALLM_SANDBOX_ROOT', old)
    setUserDataRootResolver(null)
  }
})

test('injizierter userData-Root speist Prefs/Audit/Archiv', () => {
  const old = process.env.RAWALLM_SANDBOX_ROOT
  const injected = join(tmpdir(), 'rawallm-app-paths-userdata')
  try {
    delete process.env.RAWALLM_SANDBOX_ROOT
    setUserDataRootResolver(() => injected)
    expect(userDataRoot()).toBe(injected)
    expect(archiveRoot()).toBe(join(injected, 'archive'))
    expect(auditPath()).toBe(join(injected, '.rawallmconfig', 'audit-log.ndjson'))
    expect(prefsPath()).toBe(join(injected, '.rawallmconfig', 'prefs.json'))
  } finally {
    restoreEnv('RAWALLM_SANDBOX_ROOT', old)
    setUserDataRootResolver(null)
  }
})

test('RAWALLM_ARCHIVE_ROOT gewinnt nur fuer Backup-Archivroot', () => {
  const old = process.env.RAWALLM_ARCHIVE_ROOT
  const archive = join(tmpdir(), 'rawallm-explicit-archive')
  const injected = join(tmpdir(), 'rawallm-injected-archive')
  try {
    process.env.RAWALLM_ARCHIVE_ROOT = archive
    setArchiveRootResolver(() => injected)
    expect(resolveDefaultArchiveRoot()).toBe(archive)
  } finally {
    restoreEnv('RAWALLM_ARCHIVE_ROOT', old)
    setArchiveRootResolver(null)
  }
})
