import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react'
import type { UpdateProgressPayload, UpdateStateData } from '@shared/contract-updates'
import { useStore } from './store'

// Renderer-Update-Manager-Slice (Teil-A WP-A6). Disjunkt zu store-write-*.tsx.
// Mutation AUSSCHLIESSLICH ueber window.electronAPI (IPC-Bridge). Kein fs/path
// im Renderer. Bridge-Guard vor jedem Call (kein throw bei fehlender Bridge).
// Progress-Events werden via onUpdatesProgress abonniert und beim Unmount sauber
// beendet (R6: kein Listener-Leak). Secrets/Pfade nie rendern.

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface UpdateManagerValue {
  state: UpdateStateData | null
  busy: boolean
  progress: UpdateProgressPayload | null
  check(): Promise<void>
  download(): Promise<boolean>
  install(): Promise<boolean>
  refresh(): Promise<void>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const UpdateManagerContext = createContext<UpdateManagerValue | null>(null)

// ─── Bridge-Guard-Helfer ──────────────────────────────────────────────────────

/** Prueft, ob die Bridge + die gefragte Methode verfuegbar sind. */
function hasBridge(method: keyof NonNullable<typeof window.electronAPI>): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.electronAPI &&
    typeof window.electronAPI[method] === 'function'
  )
}

// ─── run()-Helfer (busy/try-catch-finally + Toast) ────────────────────────────

type RunFn<T> = () => Promise<{ data: T | null; error: string | null }>

async function run<T>(
  fn: RunFn<T>,
  setBusy: (v: boolean) => void,
  showToast: (msg: string, icon: string) => void,
  okMsg: string
): Promise<{ data: T | null; error: string | null }> {
  setBusy(true)
  let res: { data: T | null; error: string | null }
  try {
    res = await fn()
  } catch {
    res = { data: null, error: 'Bridge-Fehler' }
  } finally {
    setBusy(false)
  }
  if (res.error || res.data === null) {
    // Generischer Fehlertext — kein Pfad/Secret/Stack
    showToast(res.error ?? 'Aktion fehlgeschlagen', 'warn')
  } else {
    showToast(okMsg, 'check')
  }
  return res
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UpdateManagerProvider({ children }: { children: ReactNode }) {
  const { actions } = useStore()

  const [state, setState] = useState<UpdateStateData | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<UpdateProgressPayload | null>(null)

  // Progress-Subscription: abonnieren wenn Bridge bereit ist.
  // Cleanup beim Unmount (R6 — kein Listener-Leak).
  useEffect(() => {
    if (!hasBridge('onUpdatesProgress')) return
    const off = window.electronAPI!.onUpdatesProgress((p) => {
      setProgress(p)
    })
    return () => {
      off()
    }
  }, [])

  // Initialer State-Load beim Mount — stiller Pfad (kein Erfolgs-Toast)
  const refresh = useCallback(async (): Promise<void> => {
    if (!hasBridge('updatesGetState')) return
    setBusy(true)
    try {
      const res = await window.electronAPI!.updatesGetState()
      if (res.data) setState(res.data)
    } catch {
      // Fehler still behandeln — kein Toast beim Hintergrund-Refresh
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ── Mutations ────────────────────────────────────────────────────────────────

  const check = useCallback(async (): Promise<void> => {
    if (!hasBridge('updatesCheck')) {
      actions.showToast('Bridge nicht verfügbar', 'warn')
      return
    }
    const res = await run(
      () => window.electronAPI!.updatesCheck(),
      setBusy,
      actions.showToast,
      'Prüfen abgeschlossen'
    )
    // State nach check aktualisieren
    if (res.data !== null) await refresh()
  }, [actions.showToast, refresh])

  const download = useCallback(async (): Promise<boolean> => {
    if (!hasBridge('updatesDownload')) {
      actions.showToast('Bridge nicht verfügbar', 'warn')
      return false
    }
    const version = state?.latestVersion
    if (!version) {
      actions.showToast('Kein Update verfügbar', 'warn')
      return false
    }
    setProgress(null)
    const res = await run(
      () => window.electronAPI!.updatesDownload({ version }),
      setBusy,
      actions.showToast,
      'Update heruntergeladen'
    )
    await refresh()
    return res.data !== null && !res.error
  }, [state?.latestVersion, actions.showToast, refresh])

  const install = useCallback(async (): Promise<boolean> => {
    if (!hasBridge('updatesInstall')) {
      actions.showToast('Bridge nicht verfügbar', 'warn')
      return false
    }
    const res = await run(
      () => window.electronAPI!.updatesInstall({ silent: true }),
      setBusy,
      actions.showToast,
      'Installation gestartet'
    )
    return res.data !== null && !res.error
  }, [actions.showToast])

  // ── Value ────────────────────────────────────────────────────────────────────

  const value: UpdateManagerValue = {
    state,
    busy,
    progress,
    check,
    download,
    install,
    refresh
  }

  return (
    <UpdateManagerContext.Provider value={value}>
      {children}
    </UpdateManagerContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUpdateManager(): UpdateManagerValue {
  const v = useContext(UpdateManagerContext)
  if (!v) throw new Error('useUpdateManager ausserhalb UpdateManagerProvider verwendet')
  return v
}
