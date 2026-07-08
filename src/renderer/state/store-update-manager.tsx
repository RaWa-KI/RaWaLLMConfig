import {
  createContext,
  useContext,
  type ReactNode
} from 'react'
import type { UpdateProgressPayload, UpdateStateData } from '@shared/contract-updates'
import { useUpdateManagerState } from './update-manager-hooks'

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

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UpdateManagerProvider({ children }: { children: ReactNode }) {
  const value = useUpdateManagerState()

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
