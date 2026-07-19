import { useMemo, useState } from 'react'
import type { DirCompare, DiffLabels, DuplicateSet } from '@shared/contract'
import { useStore } from '../../state/store'
import { type DirBases } from './DirFileDrill'
import { DirFileRow, DirSummary } from './DirFileRow'
import { DirReconcileActions } from './DirReconcileActions'
import { buildKnownPaths } from './known-paths'
import './DirDiffView.css'

// Read-only Ordner-Vergleich fuer Verzeichnis-Dubletten (Skills/Agents = Ordner).
// Kopf: farbige Zaehl-Badges (identisch/unterschiedlich/nur Shared/nur Claude).
// Datei-Tabelle (v4 innere Klappebene): pro rel-Datei eine Zeile mit Status-Pill
// und Aktions-Slots — siehe DirFileRow.tsx. Alle nicht-secret-Eintraege sind
// aufklappbar und laden Inhalt on-demand per readFull (secret-guarded). Die
// Innendatei-Drilldowns liegen HR27-bedingt in DirFileDrill.tsx. Nur 'secret'
// bleibt zu. Diff-Anzeige ist immer read-only sichtbar. Ordner-Aktionen
// (archive/move/reconcile) ueber DirReconcileActions (write-gated, Confirm-Pflicht).

export function DirDiffView({ d, labels }: { d: DuplicateSet; labels: DiffLabels }) {
  const dir = d.dir
  const { config, ui } = useStore()
  const [openRel, setOpenRel] = useState<string | null>(null)
  const knownPaths = useMemo(
    () => buildKnownPaths(config.data, ui.llm, ''),
    [config.data, ui.llm]
  )
  // Ordner-Basispfade fuer Uebernehmen eines orphan-rel-Eintrags. Aus einem real
  // vorhandenen Datei-Pfad minus rel ableiten (robuster als d.trunk.path, das bei
  // Skill-Mirrors auf SKILL.md statt auf den Ordner zeigt); Fallback: Set-Pfade.
  const bases = useMemo<DirBases>(
    () => deriveBases(dir, d.trunk.path, d.mirror.path),
    [dir, d.trunk.path, d.mirror.path]
  )
  if (!dir) return null
  const toggle = (rel: string) => setOpenRel((cur) => (cur === rel ? null : rel))
  // DisplayMode-Weiche (Teil E): Datei-Diff-Tabelle (rel-Pfade, Pills, Drills) ist
  // Expert; Zaehl-Summary und Ordner-Aktionen (write-gated) bleiben in beiden Modi.
  const expert = ui.displayMode === 'expert'
  return (
    <div className="dir-diff">
      <div className="dir-diff-head">
        <span className="ds-name">{d.name}</span>
        <span className="dir-tag">Ordner-Vergleich</span>
      </div>
      <DirSummary dir={dir} labels={labels} />
      {expert && (
        <div className="dir-files">
          {dir.files.map((f) => (
            <DirFileRow
              key={f.rel}
              f={f}
              labels={labels}
              bases={bases}
              knownPaths={knownPaths}
              fileCount={dir.files.length}
              open={openRel === f.rel}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
      <div className="diff-actions">
        {d.note && <span className="diff-note">{d.note}</span>}
        <DirReconcileActions d={d} dir={dir} knownPaths={knownPaths} />
      </div>
    </div>
  )
}

// Basispfad einer Seite aus einem realen Datei-Pfad minus rel-Suffix ableiten.
// rel kann '/' oder '\' tragen; wir entfernen das Suffix unabhaengig vom Trenner.
function baseFromEntry(abs: string | undefined, rel: string): string | null {
  if (!abs || !rel) return null
  const relSlash = rel.replace(/\\/g, '/')
  const absSlash = abs.replace(/\\/g, '/')
  if (!absSlash.endsWith('/' + relSlash) && absSlash !== relSlash) return null
  const cut = absSlash.length - relSlash.length - 1
  return cut > 0 ? abs.slice(0, cut) : null
}

// Trunk-/Mirror-Basis: zuerst aus einem Eintrag mit beidseitigem Pfad ableiten,
// sonst Set-Pfade nutzen (SKILL.md-Mirror -> Parent normalisieren).
function deriveBases(dir: DirCompare | undefined, trunkPath: string, mirrorPath: string): DirBases {
  let trunkBase = ''
  let mirrorBase = ''
  for (const f of dir?.files ?? []) {
    if (!trunkBase) trunkBase = baseFromEntry(f.trunkPath, f.rel) ?? ''
    if (!mirrorBase) mirrorBase = baseFromEntry(f.mirrorPath, f.rel) ?? ''
    if (trunkBase && mirrorBase) break
  }
  return {
    trunkBase: trunkBase || trunkPath,
    mirrorBase: mirrorBase || mirrorPath.replace(/[\\/]SKILL\.md$/i, '')
  }
}
