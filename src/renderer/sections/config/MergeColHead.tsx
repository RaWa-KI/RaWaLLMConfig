import { SEITE, TAG, type Seite } from '@shared/dup-labels'

// Spaltenkoepfe ueber dem editierbaren Paar-Diff (v4-Mockup §diff-col-head).
// HR27-Split aus MergeEditor.tsx (SRP: nur die zwei farbigen Kopf-Karten + Pfade).
// Raster 1fr/44px/1fr deckungsgleich mit den beiden CM-Editoren (je flex 1fr) und
// dem 44px-Pfeil-Mittelkanal (column-gap auf .cm-mergeViewEditors). Links die
// zentrale Version (Shared, gruen/sage), rechts die lokale Kopie (Claude/Codex/
// Workspace, blau/papa) — Label + Badge + VOLLER Pfad als .mono. Pfade sind keine
// Werte und werden nie maskiert. Reine Anzeige, kein fs/IPC, keine CM-Logik.

// Langer Sprach-Anker der lokalen Kopie je Seite (Welle 1: Codex/Workspace korrekt).
function mirrorLabel(seite: Seite): string {
  if (seite === 'codex') return SEITE.codex
  if (seite === 'workspace') return SEITE.workspace
  return SEITE.claude
}

export function MergeColHead({
  trunkPath,
  mirrorPath,
  seite
}: {
  trunkPath: string
  mirrorPath: string
  seite: Seite
}) {
  return (
    <div className="merge-col-heads" aria-hidden="true">
      <div className="diff-col-head shared">
        <div className="dc-title">
          {SEITE.shared}
          <span className="dc-tag">{TAG.quelle}</span>
        </div>
        <div className="dc-path mono" title={trunkPath}>
          {trunkPath}
        </div>
      </div>
      <div className="merge-col-gutter" />
      <div className="diff-col-head claude">
        <div className="dc-title">
          {mirrorLabel(seite)}
          <span className="dc-tag">{TAG.lokal}</span>
        </div>
        <div className="dc-path mono" title={mirrorPath}>
          {mirrorPath}
        </div>
      </div>
    </div>
  )
}
