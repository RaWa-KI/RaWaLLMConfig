import { ipcMain, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { IPC } from '@shared/channels'
import type { OpenPathData, OpenPathRequest } from '@shared/channels'
import type { IpcResult } from '@shared/contract'
import { assertInScope } from './services/path-scope'
import { configRootList } from './services/config-roots'
import { isSecretPathForRead } from './services/secret-guard'
import { kimiHome } from './scan/manifests/kimi-cats'

// ipc-open.ts — read-only „Zeigen"-Route (WP-F14, system:openPath).
// BEWUSST shell.showItemInFolder statt shell.openPath: der Datei-Manager
// zeigt den Eintrag nur an (Selektion), oeffnet aber nie eine Datei mit
// ihrer Standard-Anwendung — sicherer Default (Electron 43, electronjs.org
// /docs/latest/api/shell: showItemInFolder(fullPath) ist sync/void).
// Secret-Guard analog isSecretPathForRead: bei Secret-WERT-Pfaden wird nie
// die Datei selektiert, sondern nur ihr umgebender Ordner gezeigt.
// Fehler bleiben generisch — nie Pfade oder Werte an den Renderer leaken.

// Scope der „Zeigen"-Route: dieselbe read-taugliche Wurzelliste wie die
// Innendatei-Liste (ipc-list.ts) — Config-Wurzeln plus Kimi-Home. Drift-
// Mitglieder stammen aus diesen Wurzeln; Pfade ausserhalb werden abgelehnt,
// BEVOR die Existenz geprueft wird (kein Datei-Existenz-Orakel fuer die
// restliche Platte, Kritiker-Auflage P2-1 2026-08-07).
export function openScopeRoots(): string[] {
  const roots = configRootList()
  const kimi = kimiHome()
  return kimi && !roots.includes(kimi) ? [...roots, kimi] : roots
}

// Kern separat exportiert (testbar ohne Handler-Registrierung; roots
// injizierbar fuer Specs, Default = Produktionsscope).
export function openPathCore(
  req: OpenPathRequest,
  roots: string[] = openScopeRoots()
): IpcResult<OpenPathData> {
  try {
    const raw = typeof req?.path === 'string' ? req.path.trim() : ''
    if (!raw || !isAbsolute(raw)) return { data: null, error: 'Ungültiger Pfad' }
    const abs = resolve(raw)
    // Gleichheit zaehlt mit: der Wurzelordner selbst ist zeigbar (P3-2).
    const inScope = assertInScope(abs, roots).writable
      || roots.some((r) => resolve(r) === abs)
    if (!inScope) {
      return { data: null, error: 'Pfad außerhalb der Config-Bereiche' }
    }
    if (!existsSync(abs)) return { data: null, error: 'Pfad nicht gefunden' }
    const isDir = statSync(abs).isDirectory()
    if (!isDir && isSecretPathForRead(abs)) {
      // Secret-Datei: nur den Ordner zeigen, die Datei selbst nie selektieren.
      shell.showItemInFolder(dirname(abs))
      return { data: { shown: 'folder' }, error: null }
    }
    shell.showItemInFolder(abs)
    return { data: { shown: isDir ? 'folder' : 'file' }, error: null }
  } catch (err) {
    // Sanitisiert: nur Message, nie Pfad/Stacktrace an den Renderer.
    console.error('[ipc-open]', err instanceof Error ? err.message : 'fail')
    return { data: null, error: 'Anzeigen fehlgeschlagen' }
  }
}

export function registerOpenIpc(): void {
  ipcMain.handle(
    IPC.systemOpenPath,
    (_e, req: OpenPathRequest): IpcResult<OpenPathData> => openPathCore(req)
  )
}
