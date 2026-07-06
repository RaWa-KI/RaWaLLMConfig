// Dir-Mutations-Slice (arch-write-01 SRP-Split aus store-write-config.tsx).
// Verantwortung: archiveDirEntry / moveDirEntry / reconcileFolder.
// Alle Bridge-Aufrufe direkt; kein fs/path im Renderer.
// Exported: useDirActions(deps) -> { archiveDirEntry, moveDirEntry, reconcileFolder }

import type { DirActionResult, DirReconcileRequest, DirReconcileResult } from '@shared/contract-write'
import { ALREADY_RECONCILED } from '@shared/contract-write'
import { RECONCILE } from '@shared/dup-labels'

// showToast-Signatur ist Single Source of Truth aus StoreActions (types.ts).
export interface DirActionsDeps {
  setBusy: (v: boolean) => void
  setLastError: (v: string | null) => void
  showToast: (msg: string, icon?: string) => void
  reload: () => void
}

type DirActionRunner = (path: string, to?: string) => Promise<boolean>

function archiveDirToast(res: DirActionResult): { msg: string; icon: string } {
  const count = res.data?.inboundRefCount ?? 0
  if (count <= 0) return { msg: 'Ordner archiviert', icon: 'check' }
  return {
    msg: `Ordner archiviert — Achtung: ${count} Verweis(e) zeigen weiter auf den archivierten Pfad.`,
    icon: 'warn'
  }
}

async function runDirAction(
  deps: DirActionsDeps,
  method: 'archiveDirEntry' | 'moveDirEntry',
  path: string,
  to?: string
): Promise<{ res: DirActionResult; okLabel: string } | null> {
  if (!bridgeAvailable(method, deps.showToast)) return null
  deps.setBusy(true)
  try {
    const api = window.electronAPI!
    const res = method === 'archiveDirEntry'
      ? await api.archiveDirEntry(path)
      : await api.moveDirEntry(path, to ?? '')
    return { res, okLabel: method === 'archiveDirEntry' ? 'Ordner archiviert' : 'Ordner verschoben' }
  } catch {
    return { res: { data: null, error: 'Bridge-Fehler' }, okLabel: '' }
  } finally {
    deps.setBusy(false)
  }
}

async function finishDirAction(
  deps: DirActionsDeps,
  out: { res: DirActionResult; okLabel: string } | null
): Promise<boolean> {
  if (!out) return false
  const { res, okLabel } = out
  if (res.error || !res.data) {
    deps.setLastError(res.error ?? 'Unbekannter Fehler')
    deps.showToast(res.error ?? 'Ordner-Aktion fehlgeschlagen', 'warn')
    return false
  }
  deps.reload()
  const toast = okLabel === 'Ordner archiviert' ? archiveDirToast(res) : { msg: okLabel, icon: 'check' }
  deps.showToast(toast.msg, toast.icon)
  return true
}

async function runReconcileFolder(deps: DirActionsDeps, req: DirReconcileRequest): Promise<DirReconcileResult> {
  deps.setBusy(true)
  try {
    return await window.electronAPI!.reconcileFolder(req)
  } catch {
    return { data: null, error: 'Bridge-Fehler' }
  } finally {
    deps.setBusy(false)
  }
}

function hasReconcileWork(res: DirReconcileResult): boolean {
  return !!res.data && (
    res.data.mirrorArchivedTo !== null ||
    res.data.files.some((f) =>
      f.archivedTo != null ||
      f.backupPath != null ||
      !['skip', 'secret-skip', 'error'].includes(f.decision)
    )
  )
}

// Prueft Bridge-Verfuegbarkeit und schreibt Toast bei Fehler.
function bridgeAvailable(
  method: keyof NonNullable<typeof window.electronAPI>,
  showToast: DirActionsDeps['showToast']
): boolean {
  if (typeof window === 'undefined' || !window.electronAPI?.[method]) {
    showToast('Bridge nicht verfügbar', 'x')
    return false
  }
  return true
}

export function useDirActions(deps: DirActionsDeps) {
  const { setLastError, showToast, reload } = deps

  const archiveDirEntry: DirActionRunner = (path) =>
    runDirAction(deps, 'archiveDirEntry', path).then((out) => finishDirAction(deps, out))

  const moveDirEntry = (path: string, to: string) =>
    runDirAction(deps, 'moveDirEntry', path, to).then((out) => finishDirAction(deps, out))

  async function reconcileFolder(req: DirReconcileRequest): Promise<boolean> {
    if (!bridgeAvailable('reconcileFolder', showToast)) return false
    const res = await runReconcileFolder(deps, req)
    if (res.error || !res.data) {
      // F7-No-op: Paar war schon eingearbeitet -> kein Fehler, ruhiger Info-Toast.
      if (res.error === ALREADY_RECONCILED) {
        showToast(RECONCILE.schonErledigt, 'check')
        reload()
        return true
      }
      setLastError(res.error ?? 'Unbekannter Fehler')
      showToast(res.error ?? 'Ordner-Merge fehlgeschlagen', 'warn')
      return false
    }
    // Ehrliche No-Op-Erkennung: wenn nichts archiviert/uebernommen wurde
    // (z.B. nur geschuetzte/skip-Dateien), KEIN Scheinerfolg.
    if (!hasReconcileWork(res)) {
      showToast('Keine Änderung — nichts zu deduplizieren (geschützte Dateien oder bereits identisch).', 'warn')
      reload()
      return false
    }
    if (res.data.partial) {
      showToast('Ordner-Merge teilweise ausgeführt (einige Dateien übersprungen)', 'warn')
    } else {
      showToast('Ordner-Merge abgeschlossen', 'check')
    }
    reload()
    return true
  }

  return { archiveDirEntry, moveDirEntry, reconcileFolder }
}
