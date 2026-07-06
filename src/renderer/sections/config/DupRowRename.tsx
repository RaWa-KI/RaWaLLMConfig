import { useWriteConfig } from '../../state/store-write-config'
import { RenameInline } from './RenameInline'
import type { RenameRequest } from '@shared/contract-write-rename'

// DupRowRename — duenner Adapter, der RenameInline (WP-08) an die getypte
// Rename-Bridge haengt. Schreibt NIE selbst: ruft renameEntry (backup-first,
// partial-Report) mit den ECHTEN Pfaden je Seite, die der Parent durchreicht.
// Schliesst die Inline-Zeile nach Erfolg/Abbruch ueber onDone.

export interface DupRowRenameProps {
  currentName: string
  // ECHTE physische Pfade je Seite (nie der Anzeigename).
  sharedPath?: string
  claudePath?: string
  kind?: 'Datei' | 'Ordner'
  onDone(): void
}

export function DupRowRename({ currentName, sharedPath, claudePath, kind = 'Datei', onDone }: DupRowRenameProps) {
  const { renameEntry } = useWriteConfig()

  async function onRename(req: RenameRequest): Promise<void> {
    await renameEntry(req)
    onDone()
  }

  return (
    <RenameInline
      currentName={currentName}
      sharedPath={sharedPath}
      claudePath={claudePath}
      kind={kind}
      onRename={onRename}
      onCancel={onDone}
    />
  )
}
