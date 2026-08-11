import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { DriftRelation } from '@shared/contract-drift'
import { DRIFT, DRIFT_GRUPPEN, DRIFT_IGNORIERTE, DRIFT_PANEL } from '@shared/drift-labels'
import { Icon } from '../../components/Icon'
import { DriftEntry } from './DriftEntry'
import './DuplicatePanel.css'
import './DriftPanel.css'

// DriftPanel — eigener Abschnitt im Duplikat-Bereich der userglobal-Familie.
// Zeigt Cross-Loader-Kopien (DriftRelationen) mit Status, Vorschlag und
// Nutzer-Festlegung.
//
// Standardliste = NUR das, was noch offen ist. Bereits entschiedene Relationen
// (parity ODER ignored) wandern in je eine eingeklappte Gruppe: der Nutzer sah
// vorher seine eigenen „ist so gewollt"-Festlegungen dauerhaft weiter in der
// Liste und las den ganzen Abschnitt als offenen Aufräum-Stapel (F3).
// Der Panel-Kopf sagt jetzt ausdrücklich, dass das KEINE Duplikate sind.
// KEIN Entfernen hier — erst eine 'echte Dublette'-Festlegung aktiviert im
// Eintrag den bestehenden Reconcile-Pfad (Confirm + backup-first).

interface DriftGroups {
  offen: DriftRelation[]
  parity: DriftRelation[]
  ignoriert: DriftRelation[]
}

function groupRelations(relations: DriftRelation[]): DriftGroups {
  const groups: DriftGroups = { offen: [], parity: [], ignoriert: [] }
  for (const rel of relations) {
    if (rel.decision === 'ignored') groups.ignoriert.push(rel)
    else if (rel.decision === 'parity') groups.parity.push(rel)
    else groups.offen.push(rel)
  }
  return groups
}

export function DriftPanel({ relations }: { relations: DriftRelation[] }) {
  const groups = useMemo(() => groupRelations(relations), [relations])

  if (relations.length === 0) {
    return (
      <div className="dup-panel">
        <div className="empty">
          <p>{DRIFT.leer}</p>
        </div>
      </div>
    )
  }

  return (
    <section className="dup-panel drift-panel" aria-label={DRIFT_PANEL.kopf}>
      <header className="drift-head">
        <h3 className="drift-head-title">{DRIFT_PANEL.kopf}</h3>
        <p className="drift-head-text">{DRIFT_PANEL.abgrenzung}</p>
        <p className="drift-head-text drift-head-detail">{DRIFT.erklaerung}</p>
      </header>

      {groups.offen.length === 0 ? (
        <p className="drift-open-empty">{DRIFT_GRUPPEN.offenLeer}</p>
      ) : (
        groups.offen.map((rel, i) => (
          <DriftEntry key={`${rel.cat}/${rel.name}`} rel={rel} startOpen={i === 0} dimmed={false} />
        ))
      )}

      <DriftGroup
        title={DRIFT_GRUPPEN.parityTitel(groups.parity.length)}
        ariaLabel={DRIFT_GRUPPEN.parityAria(groups.parity.length)}
        hint={DRIFT_GRUPPEN.parityHinweis}
        relations={groups.parity}
      />
      <DriftGroup
        title={DRIFT_GRUPPEN.ignoriertTitel(groups.ignoriert.length)}
        ariaLabel={DRIFT_IGNORIERTE.einblenden(groups.ignoriert.length)}
        closeAriaLabel={DRIFT_IGNORIERTE.ausblenden}
        hint={DRIFT_GRUPPEN.ignoriertHinweis}
        relations={groups.ignoriert}
        dimmed
      />
    </section>
  )
}

interface DriftGroupProps {
  title: string
  ariaLabel: string
  closeAriaLabel?: string
  hint: string
  relations: DriftRelation[]
  dimmed?: boolean
}

/** Eine eingeklappte Gruppe bereits entschiedener Relationen (leer = nichts rendern). */
function DriftGroup(props: DriftGroupProps): ReactNode {
  const { title, ariaLabel, closeAriaLabel, hint, relations, dimmed = false } = props
  const [open, setOpen] = useState(false)
  if (relations.length === 0) return null
  return (
    <div className="drift-group">
      <button
        type="button"
        className="drift-group-toggle"
        aria-expanded={open}
        aria-label={open ? (closeAriaLabel ?? title) : ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="drift-group-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="drift-group-title">{title}</span>
        <span className="drift-group-ic" aria-hidden="true">{Icon.check}</span>
      </button>
      {open && (
        <div className="drift-group-body">
          <p className="drift-group-hint">{hint}</p>
          {relations.map((rel) => (
            <DriftEntry
              key={`${rel.cat}/${rel.name}`}
              rel={rel}
              startOpen={false}
              dimmed={dimmed}
            />
          ))}
        </div>
      )}
    </div>
  )
}
