import type { BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import { IPC_EVENTS } from '@shared/channels'
import type { ConfigChangedPayload, ConfigFamily, ConfigRootKind } from '@shared/contract-watcher-fs'
import { markConfigScanCacheStale } from './config-scan-cache'
import { configRoots, configWatchRootList } from './config-roots'

const DEBOUNCE_MS = 650
const WATCHER_REASON = 'fs-change'

let activeWatcher: FSWatcher | null = null
let debounceTimer: NodeJS.Timeout | null = null
let pendingFamilies = new Set<ConfigFamily>()
let pendingRootKinds = new Set<ConfigRootKind>()
let currentGetWindow: (() => BrowserWindow | null) | null = null

interface RootMatch {
  family: ConfigFamily
  rootKind: ConfigRootKind
}

interface WatchedRoot extends RootMatch {
  path: string
}

interface WatcherOptions {
  debounceMs?: number
  roots?: string[]
}

export function classifyConfigPath(filePath: string): RootMatch {
  for (const root of watchedRootMatches()) {
    if (isUnderRoot(filePath, root.path)) return { family: root.family, rootKind: root.rootKind }
  }
  return { family: 'local', rootKind: 'local' }
}

function watchedRootMatches(): WatchedRoot[] {
  const roots = configRoots()
  const known: WatchedRoot[] = [
    { path: roots.claudeHome, family: 'claude', rootKind: 'userglobal' },
    { path: roots.codexHome, family: 'codex', rootKind: 'userglobal' },
    { path: roots.sharedClaude, family: 'shared', rootKind: 'shared' },
    { path: roots.projectRoot, family: 'local', rootKind: 'project' }
  ]
  const out: WatchedRoot[] = []
  const knownByPath = new Map(known.map((root) => [path.resolve(root.path).toLowerCase(), root]))
  for (const rootPath of configWatchRootList()) {
    const key = path.resolve(rootPath).toLowerCase()
    out.push(knownByPath.get(key) ?? { path: rootPath, family: 'local', rootKind: 'local' })
  }
  return out
}

export function shouldIgnoreConfigPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => ['node_modules', '.git', 'dist', 'build'].includes(part))) return true
  const base = path.basename(normalized)
  if (base === 'audit-log.ndjson') return true
  if (base.endsWith('.log') || base.endsWith('.tmp')) return true
  return base.endsWith('.lock') || ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].includes(base)
}

export function startConfigWatcher(
  getWindow: () => BrowserWindow | null,
  options: WatcherOptions = {}
): void {
  stopConfigWatcher()
  currentGetWindow = getWindow
  const roots = existingRoots(options.roots ?? configWatchRootList())
  if (roots.length === 0) return
  activeWatcher = watch(roots, {
    ignoreInitial: true,
    ignored: shouldIgnoreConfigPath,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    persistent: true
  })
  activeWatcher.on('add', (fp) => queueChange(fp, options.debounceMs))
  activeWatcher.on('change', (fp) => queueChange(fp, options.debounceMs))
  activeWatcher.on('unlink', (fp) => queueChange(fp, options.debounceMs))
  activeWatcher.on('error', (err) => {
    console.error('[config-watcher]', err instanceof Error ? err.message : 'watch-error')
  })
}

export function stopConfigWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  pendingFamilies = new Set()
  pendingRootKinds = new Set()
  currentGetWindow = null
  const watcher = activeWatcher
  activeWatcher = null
  if (watcher) void watcher.close().catch((err) => {
    console.error('[config-watcher]', err instanceof Error ? err.message : 'close-error')
  })
}

function queueChange(filePath: string, debounceMs = DEBOUNCE_MS): void {
  if (shouldIgnoreConfigPath(filePath)) return
  const match = classifyConfigPath(filePath)
  markConfigScanCacheStale(WATCHER_REASON)
  pendingFamilies.add(match.family)
  pendingRootKinds.add(match.rootKind)
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(flushChange, debounceMs)
}

function flushChange(): void {
  debounceTimer = null
  const payload = buildPayload()
  pendingFamilies = new Set()
  pendingRootKinds = new Set()
  const win = currentGetWindow?.()
  if (!win || win.isDestroyed()) return
  win.webContents.send(IPC_EVENTS.configChanged, payload)
}

function buildPayload(): ConfigChangedPayload {
  return {
    families: [...pendingFamilies].sort(),
    rootKinds: [...pendingRootKinds].sort(),
    at: new Date().toISOString(),
    reason: WATCHER_REASON
  }
}

function existingRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const root of roots) {
    const key = path.resolve(root).toLowerCase()
    if (seen.has(key) || !existsSync(root)) continue
    seen.add(key)
    out.push(root)
  }
  return out
}

function isUnderRoot(rawPath: string, rawRoot: string): boolean {
  if (!rawPath || !rawRoot) return false
  const filePath = path.resolve(rawPath).toLowerCase()
  const rootPath = path.resolve(rawRoot).toLowerCase()
  return filePath === rootPath || filePath.startsWith(rootPath + path.sep)
}
