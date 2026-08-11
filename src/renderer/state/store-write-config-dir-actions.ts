// Dir-Mutations-Slice (arch-write-01 SRP-Split aus store-write-config.tsx).
// Verantwortung: archiveDirEntry / moveDirEntry.
// Alle Bridge-Aufrufe direkt; kein fs/path im Renderer.
// Exported: useDirActions(deps) -> { archiveDirEntry, moveDirEntry }
//
// Der Ordner-Merge liegt NICHT mehr hier (2026-08-11): er laeuft ueber die
// Integrity-Route (integrityPreview + integrityApply, Zwei-Klick-Vorschau gegen
// planHash) in DirReconcileActions/reconcile-plan-controller.

import type { DirActionResult } from '@shared/contract-write'

// showToast-Signatur ist Single Source of Truth aus StoreActions (types.ts).
export interface DirActionsDeps {
  setBusy: (v: boolean) => void
  setLastError: (v: string | null) => void
  showToast: (msg: string, icon?: string) => void
  reload: () => void
}

type DirActionRunner = (path: string) => Promise<boolean>

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
  path: string
): Promise<{ res: DirActionResult; okLabel: string } | null> {
  if (!bridgeAvailable(method, deps.showToast)) return null
  deps.setBusy(true)
  try {
    const api = window.electronAPI!
    const res = method === 'archiveDirEntry'
      ? await api.archiveDirEntry(path)
      : await api.moveDirEntry(path) // Ziel waehlt der Owner im Main-Ordnerdialog
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
  // Owner-Abbruch im Ordnerdialog ist KEIN Fehler: still ohne roten Toast weiter.
  if (res.error === 'move-cancelled') return false
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
  const archiveDirEntry: DirActionRunner = (path) =>
    runDirAction(deps, 'archiveDirEntry', path).then((out) => finishDirAction(deps, out))

  const moveDirEntry: DirActionRunner = (path) =>
    runDirAction(deps, 'moveDirEntry', path).then((out) => finishDirAction(deps, out))

  return { archiveDirEntry, moveDirEntry }
}
