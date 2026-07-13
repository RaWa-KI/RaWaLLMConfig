import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Watcher } from '../../shared/contract'
import { scanWatcher } from '../../src/main/scan/sys-scan'
import { sysScanPlatformCopy } from '../../src/main/scan/sys-scan-platform-copy'

function watcher(sourceCount: number): Watcher {
  return {
    daemon: {
      status: 'Ready',
      lastResult: '0',
      schedule: 'Task-Scheduler (run-hidden)',
      tokens: '0',
      sources: sourceCount,
      updated: '2026-07-10',
      note: 'Test'
    },
    tiers: [],
    sources: Array.from({ length: sourceCount }, (_, index) => ({
      name: `Quelle ${index}`,
      kind: 'CLI',
      current: '1',
      latest: '1',
      tier: 1,
      state: 'current'
    })),
    changelogs: []
  }
}

test('Sys-Scan kennzeichnet Standardpfade als Erwartung statt Erkennung', () => {
  const windows = sysScanPlatformCopy('win32')
  const linux = sysScanPlatformCopy('linux')

  expect(windows.claudeDescription).toBe(
    'Erwarteter Standalone-Pfad: ~/.local/bin/claude.exe · Versionscheck über PATH; Installationsursprung nicht nachgewiesen.'
  )
  expect(linux.claudeDescription).toBe(
    'Erwarteter Standalone-Pfad: ~/.local/bin/claude · Versionscheck über PATH; Installationsursprung nicht nachgewiesen.'
  )
  expect(windows.claudeDescription).not.toContain('erkannt')
  expect(linux.claudeDescription).not.toContain('erkannt')
})

test('Windows behaelt Scheduler- und Erfolgsstatus im Live-Zweig', async () => {
  const result = await scanWatcher('win32', {
    live: async () => watcher(1),
    fallback: () => watcher(1)
  })

  expect(result.daemon.status).toBe('Ready')
  expect(result.daemon.lastResult).toBe('0')
  expect(sysScanPlatformCopy('win32').watcherSchedule).toBe(
    'Task-Scheduler (run-hidden)'
  )
})

test('Linux meldet ohne Scheduler im Live-Zweig keinen Erfolg', async () => {
  const result = await scanWatcher('linux', {
    live: async () => watcher(1),
    fallback: () => watcher(1)
  })

  expect(result.daemon.status).toBe('Nicht eingerichtet')
  expect(result.daemon.lastResult).toBe('—')
  expect(result.daemon.schedule).toBe('systemd-timer/cron — nicht eingerichtet')
})

test('Linux meldet ohne Scheduler auch im Fallback keinen Erfolg', async () => {
  const result = await scanWatcher('linux', {
    live: async () => watcher(0),
    fallback: () => watcher(1)
  })

  expect(result.daemon.status).toBe('Nicht eingerichtet')
  expect(result.daemon.lastResult).toBe('—')
  expect(sysScanPlatformCopy('linux').watcherSchedule).toBe(
    'systemd-timer/cron — nicht eingerichtet'
  )
})

test('Darwin und FreeBSD fallen nicht auf Windows-Texte zurueck', async () => {
  for (const platform of ['darwin', 'freebsd'] as const) {
    const copy = sysScanPlatformCopy(platform)
    const result = await scanWatcher(platform, {
      live: async () => watcher(1),
      fallback: () => watcher(1)
    })

    expect(copy.claudeDescription).not.toContain('.exe')
    expect(copy.watcherSchedule).toBe('Scheduler auf dieser Plattform nicht unterstützt')
    expect(result.daemon.status).toBe('Nicht unterstützt')
    expect(result.daemon.lastResult).toBe('—')
    expect(result.daemon.schedule).not.toContain('Task-Scheduler')
  }
})

test('README benennt Versionscheck und Installationsursprung ehrlich', () => {
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')
  const normalized = readme.replace(/\s+/g, ' ')

  expect(readme).not.toContain('Claude Code wird als native Standalone-Installation erkannt.')
  expect(readme).not.toContain('Claude Code is detected as a native standalone installation.')
  expect(normalized).toContain(
    'Der Versionscheck über `claude --version` bestätigt nur die erreichbare Version; er weist weder den Installationspfad noch den Installationsursprung nach.'
  )
  expect(normalized).toContain(
    'The `claude --version` check confirms only the reachable version; it proves neither the installation path nor its origin.'
  )
})
