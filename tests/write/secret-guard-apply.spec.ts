import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyWrite, applyDirAction } from '../../src/main/services/apply'
import { SECRET_DENY_REASON } from '../../src/main/services/secret-guard'
import { setWriteEnabledRuntime } from '../../src/main/services/write-mode'
import { makeSandbox, seedFile, sandboxPath, exists } from './fixtures'
import { applyOpts, withWriteMode } from './secret-guard-fixtures'

test.beforeEach(() => setWriteEnabledRuntime(null))

test('applyWrite P1: settings.json edit nur mit ownerEdit + Schreibmodus AN', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', JSON.stringify({ theme: 'dark' }))
  withWriteMode(true, () => {
    const blocked = applyWrite({ action: 'edit', path: file, content: '{"theme":"light"}' }, applyOpts(sb))
    expect(blocked.error).toBe(SECRET_DENY_REASON)
    expect(blocked.data).toBeNull()
    expect(readFileSync(file, 'utf8')).toContain('dark')

    const ok = applyWrite(
      { action: 'edit', path: file, content: '{"theme":"light"}', ownerEdit: true },
      applyOpts(sb)
    )
    expect(ok.error).toBeNull()
    expect(ok.data?.action).toBe('edit')
    expect(ok.data?.backupPath).not.toBeNull()
    expect(readFileSync(file, 'utf8')).toContain('light')
  })
})

test('applyWrite: ownerEdit ohne Schreibmodus bleibt geblockt', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', '{}')
  withWriteMode(false, () => {
    const res = applyWrite({ action: 'edit', path: file, content: '{}', ownerEdit: true }, applyOpts(sb))
    expect(res.error).toBe(SECRET_DENY_REASON)
    expect(res.data).toBeNull()
  })
})

test('applyWrite P2: move auf Secret-Pfad bleibt geblockt trotz ownerEdit', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', '{}')
  const dest = sandboxPath(sb, 'sub', 'settings.json')
  withWriteMode(true, () => {
    const res = applyWrite({ action: 'move', path: file, to: dest, ownerEdit: true }, applyOpts(sb))
    expect(res.error).toBe(SECRET_DENY_REASON)
    expect(res.data).toBeNull()
    expect(exists(file)).toBe(true)
    expect(exists(dest)).toBe(false)
  })
})

test('applyWrite P2: move-Ziel (req.to) Secret-Klasse bleibt geblockt', () => {
  const sb = makeSandbox()
  const src = seedFile(sb, 'plain.md', '# doku')
  const secretDest = sandboxPath(sb, 'auth.json')
  withWriteMode(true, () => {
    const res = applyWrite({ action: 'move', path: src, to: secretDest, ownerEdit: true }, applyOpts(sb))
    expect(res.error).toBe(SECRET_DENY_REASON)
    expect(res.data).toBeNull()
    expect(exists(src)).toBe(true)
    expect(exists(secretDest)).toBe(false)
  })
})

test('applyWrite P2: archive auf Secret-Pfad bleibt geblockt trotz ownerEdit', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', '{}')
  withWriteMode(true, () => {
    const res = applyWrite({ action: 'archive', path: file, ownerEdit: true }, applyOpts(sb))
    expect(res.error).toBe(SECRET_DENY_REASON)
    expect(res.data).toBeNull()
    expect(exists(file)).toBe(true)
  })
})

test('applyDirAction P2: archive-dir mit Secret-Datei im Baum bleibt secret-skip', () => {
  const sb = makeSandbox()
  const dir = join(sb.configDir, 'bundle')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), '{}', 'utf8')
  writeFileSync(join(dir, 'readme.md'), '# x', 'utf8')
  const res = applyDirAction({ action: 'archive-dir', path: dir }, applyOpts(sb))
  expect(res.data).toBeNull()
  expect(res.error).toBeTruthy()
  expect(exists(dir)).toBe(true)
})
