import type { DiffLabels, DuplicateSet } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { SECRET_PAAR } from '@shared/dup-labels'
import { DirDiffView } from './DirDiffView'
import { FALLBACK_LABELS, isOversizeFallback } from './diff-shared'
import { MergeEditor } from './MergeEditor'
import { DiffReadOnly, readOnlyLines, usePairContent } from './diff-set-parts'

// Einzeldatei-Paar-Diff. Default-AN: nicht-secret-Paare sind direkt editierbare
// MergeView (MergeEditor mit Chunk-Uebernahme ←/→ + Speichern je Seite). Maskierte
// (secret-bearing), geschuetzte oder oversize Paare bleiben read-only Side-by-side.
// Verzweigung (Ordner-Dubletten): wenn d.dir gesetzt -> DirDiffView statt Datei-Diff.
// Editierbarer Inhalt kommt IMMER aus readFull (vollstaendig), nie aus d.lines
// (die maskiert/gekappt sein koennen). Schreiben laeuft ueber den gated Write-Layer.

export function DiffView({ dups, labels }: { dups: DuplicateSet[]; labels?: DiffLabels }) {
  const l = labels ?? FALLBACK_LABELS
  if (dups.length === 0) {
    return (
      <div className="empty">
        {Icon.check}
        <p>Keine Duplikate in dieser Kategorie.</p>
      </div>
    )
  }
  return (
    <div>
      <div className="diff-intro">
        Seite-an-Seite-Abgleich {l.trunk} und {l.mirror}. Änderungen werden vor dem Speichern automatisch gesichert.
      </div>
      {dups.map((d) =>
        d.dir ? <DirDiffView key={d.name} d={d} labels={l} /> : <DiffSet key={d.name} d={d} labels={l} />
      )}
    </div>
  )
}

function DiffSet({ d, labels }: { d: DuplicateSet; labels: DiffLabels }) {
  const { ui } = useStore()
  // Voll-Inhalt beider Seiten laden (readFull, secret-guarded). Quelle fuer
  // Editieren UND read-only-Fallback, falls der Scanner keine lines lieferte.
  const c = usePairContent(d.trunk.path, d.mirror.path)
  const lines = readOnlyLines(d, c)
  // Beidseitig secret-classed Paar: Scanner-masked-Flag (Verdict aus Roh-SHA) ODER
  // geladener maskierter Inhalt. Solche Paare sind read-only NUR-Anzeige — keine
  // Aktion (kein Bulk, der sonst deterministisch in 'secret-skip' liefe).
  const secretPair = d.masked === true || c.masked
  // Editierbar nur wenn: Voll-Inhalt da, NICHT secret-classed (kein Secret-Round-
  // Trip), und kein gekappter Oversize-Diff.
  const editable = c.state === 'ready' && !secretPair && !isOversizeFallback(lines)
  // DisplayMode-Weiche (Teil E): reine Diff-Zeilen (read-only Side-by-side) sind
  // Experten-Information. Der editierbare MergeEditor bleibt in beiden Modi
  // erreichbar (Merge-Aktion, Write-Gates unveraendert).
  const expert = ui.displayMode === 'expert'

  return (
    <div className="diff-set">
      <DiffSetHead d={d} secretPair={secretPair} />
      {c.state === 'loading' && <div className="diff-loading">Lade Inhalt …</div>}
      {c.state === 'protected' && (
        <div className="diff-protected">
          Kein Datei-Inhalt vergleichbar — Verzeichnis, geschützt oder nicht lesbar.
        </div>
      )}
      {c.state === 'ready' &&
        (editable ? (
          <MergeEditor
            trunkPath={d.trunk.path}
            mirrorPath={d.mirror.path}
            initialTrunk={c.trunk}
            initialMirror={c.mirror}
          />
        ) : (
          expert && <DiffReadOnly d={d} labels={labels} lines={lines} masked={c.masked} maskedCount={c.maskedCount} />
        ))}
      <div className="diff-actions">
        <span className="diff-note">{d.note}</span>
      </div>
    </div>
  )
}

// Kopf eines Paar-Diffs (HR27-Split aus DiffSet): Name + Verdikt-Badge; bei
// secret-classed Paaren zusaetzlich der Sperr-Hinweis (read-only NUR-Anzeige).
function DiffSetHead({ d, secretPair }: { d: DuplicateSet; secretPair: boolean }) {
  return (
    <>
      <div className="diff-set-head">
        <span className="ds-name">{d.name}</span>
        {secretPair ? (
          <span className="ds-verdict secret" title={SECRET_PAAR.grundAnzeige}>
            {Icon.key}
            {SECRET_PAAR.badge}
          </span>
        ) : (
          <span className={'ds-verdict ' + d.verdict}>
            {d.verdict === 'same' ? 'identisch' : 'unterschiedlich'}
          </span>
        )}
      </div>
      {secretPair && (
        <div className="diff-secret-note" title={SECRET_PAAR.grundAnzeige}>
          {SECRET_PAAR.aktionGesperrt}
        </div>
      )}
    </>
  )
}
