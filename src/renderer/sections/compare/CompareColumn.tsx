import type { AlignedCell, AlignedColumn } from './compare-logic'
import { MaskedBadge, OversizeHint } from '../config/diff-shared'
import { LoadHintBadge } from './LoadHintBadge'

// CompareColumn — eine Datei-Spalte im N-Spalten-Vergleich. Optik bewusst
// deckungsgleich mit der Duplikat-Diff-Anzeige (Reuse der diff-shared-Marker
// und der .diff-col/.dline-Tokens aus components.css — KEIN zweiter Diff-Klon).
// Kopf: Label/Origin/voller Pfad (MergeColHead-Muster, fuer N Spalten generalisiert)
// + MaskedBadge (col.masked) + OversizeHint (col.oversize) + Platzhalter
// (!col.available). Body: alignte Zeilen mit Praesenz-/dup-Markern. Reine Anzeige.

// Zeilen-Klasse analog diff-shared/diffCls-Semantik, aber Multi-Way:
//   dup (in allen gleich)            -> ctx/„identisch" (neutral)
//   present, kind!=='dup'            -> add-artig (hier vorhanden / nicht ueberall)
//   !present                         -> del-artiger Platzhalter (fehlt hier)
function cellCls(cell: AlignedCell): string {
  if (!cell.present) return 'del'
  return cell.kind === 'dup' ? 'ctx' : 'add'
}

// Gutter-Marker analog diffSign: + bei „hier vorhanden, nicht ueberall",
// − bei „fehlt hier", leer bei dup (in allen gleich).
function cellSign(cell: AlignedCell): string {
  if (!cell.present) return '−'
  return cell.kind === 'dup' ? '' : '+'
}

// Kopf einer Spalte (MergeColHead-Muster, N-Spalten-tauglich). Pfade sind keine
// Werte und werden nie maskiert. Lade-Badge-Slot fuer WP-6 ist klar benannt.
function ColHead({ col }: { col: AlignedColumn['col'] }) {
  return (
    <div className="diff-col-head cmp-col-head">
      <span className="dc-title">{col.label}</span>
      {col.origin && <span className="dc-origin">{col.origin}</span>}
      {/* WP-6-Slot (Q7): Lade-Hinweis je Datei — wann/wie das Tool sie laedt. */}
      <span className="cmp-col-load-slot" data-wp6-slot="col-load">
        <LoadHintBadge path={col.path} origin={col.origin} />
      </span>
      <span className="dc-path mono" title={col.path}>
        {col.path}
      </span>
      <span className="cmp-col-tags">
        {col.masked && <MaskedBadge />}
      </span>
    </div>
  )
}

export function CompareColumn({ column }: { column: AlignedColumn }) {
  const { col, cells } = column
  return (
    <div className="diff-col cmp-col">
      <ColHead col={col} />
      {col.oversize && <OversizeHint />}
      {!col.available ? (
        <div className="cmp-col-missing">
          Datei nicht lesbar oder nicht gefunden — keine Zeilen vergleichbar.
        </div>
      ) : (
        <div className="diff-body">
          {cells.map((cell, i) =>
            cell.fold ? (
              // Leerlauf-Faltung: ein Lauf fehlender Zeilen → eine kompakte Markierung.
              <div className="dline fold" key={i}>
                ··· {cell.fold} Zeile(n) nur in anderen Dateien ···
              </div>
            ) : (
              <div className={'dline ' + cellCls(cell)} key={i}>
                <span className="dgut">{cellSign(cell)}</span>
                {cell.present ? cell.text : ''}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
