import type { Watcher } from '@shared/contract'

type WatcherState = Pick<Watcher['daemon'], 'status' | 'lastResult'>

export interface SysScanPlatformCopy {
  claudeDescription: string
  watcherSchedule: string
  watcherState: WatcherState | null
}

function expectedStandalone(path: string): string {
  return `Erwarteter Standalone-Pfad: ${path} · Versionscheck über PATH; Installationsursprung nicht nachgewiesen.`
}

export function sysScanPlatformCopy(platform: NodeJS.Platform): SysScanPlatformCopy {
  if (platform === 'win32') return {
    claudeDescription: expectedStandalone('~/.local/bin/claude.exe'),
    watcherSchedule: 'Task-Scheduler (run-hidden)',
    watcherState: null
  }
  if (platform === 'linux') return {
    claudeDescription: expectedStandalone('~/.local/bin/claude'),
    watcherSchedule: 'systemd-timer/cron — nicht eingerichtet',
    watcherState: { status: 'Nicht eingerichtet', lastResult: '—' }
  }
  return {
    claudeDescription: 'Versionscheck über PATH; Installationsursprung und Plattformpfad nicht nachgewiesen.',
    watcherSchedule: 'Scheduler auf dieser Plattform nicht unterstützt',
    watcherState: { status: 'Nicht unterstützt', lastResult: '—' }
  }
}

export function applyWatcherPlatformCopy(
  watcher: Watcher,
  platform: NodeJS.Platform
): Watcher {
  const copy = sysScanPlatformCopy(platform)
  return {
    ...watcher,
    daemon: {
      ...watcher.daemon,
      ...(copy.watcherState ?? {}),
      schedule: copy.watcherSchedule
    }
  }
}
