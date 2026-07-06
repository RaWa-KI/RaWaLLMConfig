import type { ArchiveBackupEntry, ArchiveKind } from '@shared/contract-archive'
import { Icon } from '../../components/Icon'
import { fmtSize } from '../../lib/fmt-size'

// Backup-Liste, gruppiert nach Tag (dayTag). Spalten: Datei · Original · Zeit ·
// Tag · Art · Groesse · (Restore). Restore nur fuer write/archive-Backups;
// snapshot-Ordner sind read-only markiert. Reine Anzeige — der Restore-Flow
// (Confirm + Zielpfad + gated Bridge) lebt in ArchivSection/RestoreConfirm.

const KIND_LABEL: Record<ArchiveKind, string> = {
  write: 'Pre-Snapshot',
  archive: 'Archiviert',
  snapshot: 'Ordner-Snapshot'
}

// Anzeigezeit aus ISO (nur HH:MM:SS). Leer wenn unparsebar.
function fmtTime(iso: string): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  return new Date(t).toLocaleTimeString('de-DE', { hour12: false })
}

// Eintraege nach dayTag gruppieren (Reihenfolge: bereits desc aus dem Main).
function groupByDay(entries: ArchiveBackupEntry[]): Array<{ day: string; items: ArchiveBackupEntry[] }> {
  const order: string[] = []
  const map = new Map<string, ArchiveBackupEntry[]>()
  for (const e of entries) {
    const key = e.dayTag || 'ohne Datum'
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(e)
  }
  return order.map((day) => ({ day, items: map.get(day)! }))
}

export function ArchivList(props: {
  entries: ArchiveBackupEntry[]
  truncated: boolean
  onRestoreClick: (e: ArchiveBackupEntry) => void
}) {
  const { entries, truncated, onRestoreClick } = props
  const groups = groupByDay(entries)
  return (
    <div className="archiv-body">
      <div className="archiv-summary">
        <span>{entries.length} Backup{entries.length === 1 ? '' : 's'}</span>
        <span className="sum-sep">·</span>
        <span>{groups.length} Tag{groups.length === 1 ? '' : 'e'}</span>
        {truncated && (
          <>
            <span className="sum-sep">·</span>
            <span className="sum-warn">Liste gekürzt (Limit erreicht)</span>
          </>
        )}
      </div>
      {groups.map((g) => (
        <section className="archiv-group" key={g.day}>
          <h3 className="archiv-group-head">{g.day} <span className="agh-n">({g.items.length})</span></h3>
          <div className="archiv-rows">
            <div className="archiv-row archiv-row--head">
              <span>Datei</span><span>Original</span><span>Zeit</span><span>Art</span><span>Größe</span><span />
            </div>
            {g.items.map((e, i) => (
              <ArchivRow key={`${g.day}-${i}`} entry={e} onRestoreClick={onRestoreClick} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ArchivRow(props: { entry: ArchiveBackupEntry; onRestoreClick: (e: ArchiveBackupEntry) => void }) {
  const { entry, onRestoreClick } = props
  const restorable = entry.kind === 'write' || entry.kind === 'archive'
  return (
    <div className={`archiv-row archiv-row--${entry.kind}`}>
      <code className="archiv-file" title={entry.backupPath}>{baseOf(entry.backupPath)}</code>
      <span className="archiv-orig" title={entry.originalPath ?? entry.originalName}>{entry.originalName}</span>
      <span className="archiv-time">{fmtTime(entry.stamp)}</span>
      <span className={`archiv-kind archiv-kind--${entry.kind}`}>{KIND_LABEL[entry.kind]}</span>
      <span className="archiv-size">{fmtSize(entry.size)}</span>
      <span className="archiv-act">
        {restorable ? (
          <button type="button" className="btn-ghost sm" onClick={() => onRestoreClick(entry)} title="Diese Version wiederherstellen">
            {Icon.refresh}Wiederherstellen
          </button>
        ) : (
          <span className="archiv-ro" title="Ordner-Snapshot — v1 nicht einzeln wiederherstellbar">read-only</span>
        )}
      </span>
    </div>
  )
}

// Basisname ohne path-Import (Renderer-leichtgewichtig); nie ein Secret-Wert.
function baseOf(p: string): string {
  const norm = p.replace(/\\/g, '/')
  return norm.slice(norm.lastIndexOf('/') + 1)
}
