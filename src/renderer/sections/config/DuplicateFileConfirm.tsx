import type { DuplicateSet } from '@shared/contract'
import type { ReconcileRequest } from '@shared/contract-write'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { SEITE, SICHERUNG, CONFIRM, WRITE_AUS, seiteForFamily } from '@shared/dup-labels'

// Confirm-Block fuer ein Einzeldatei-Paar (HR27-Split aus DuplicatePanel.tsx,
// WP-06 Teil B). Bestaetigung vor dem Schreiben: erklaert Quelle → Ziel →
// Wirkung in Alltagssprache, zeigt beide Pfade (Sprach-Anker Shared/Claude) und
// den backup-first-Hinweis. SYMMETRISCH (Finding B): Titel/Text je Richtung
// (keep-trunk/keep-mirror/adopt-mirror/adopt-trunk), seite-parametrisiert.
// Schreibzugriff write-gated (Button disabled bei OFF). Texte aus dup-labels.ts.

type Decision = ReconcileRequest['decision']
type ConfirmTexts = ReturnType<typeof CONFIRM>

// Titel + Erklaer-Text je Owner-Richtung (alle vier symmetrisch).
function textFor(c: ConfirmTexts, decision: Decision): { titel: string; text: string } {
  switch (decision) {
    case 'adopt-mirror':
      return { titel: c.titelUebernehmen, text: c.textUebernehmen }
    case 'keep-trunk':
      return { titel: c.titelBehalten, text: c.textBehalten }
    case 'keep-mirror':
      return { titel: c.titelBehaltenMirror, text: c.textBehaltenMirror }
    case 'adopt-trunk':
      return { titel: c.titelUebernehmenTrunk, text: c.textUebernehmenTrunk }
  }
}

export function FilePairConfirm({
  d,
  decision,
  busy,
  writeEnabled,
  writeReason,
  onCancel,
  onConfirm
}: {
  d: DuplicateSet
  decision: Decision
  busy: boolean
  writeEnabled: boolean
  writeReason: string | null
  onCancel(): void
  onConfirm(): void
}) {
  const { ui } = useStore()
  const c = CONFIRM(seiteForFamily(ui.llm))
  const { titel, text } = textFor(c, decision)
  const disabledTitle = !writeEnabled ? (writeReason ?? WRITE_AUS) : undefined
  return (
    <div className="dup-confirm">
      <div className="dup-confirm-title">
        {Icon.warn}
        {titel}
      </div>
      <p className="dup-confirm-text">{text}</p>
      <div className="dup-confirm-paths mono">
        <div>{c.pfadShared}: {d.trunk.path}</div>
        <div>{c.pfadClaude}: {d.mirror.path}</div>
      </div>
      <div className="dup-confirm-hint">{Icon.snap}{SICHERUNG.snapshot}</div>
      <div className="dup-confirm-btns">
        <button type="button" className="dup-btn" onClick={onCancel} disabled={busy}>
          {Icon.x}{c.abbrechen}
        </button>
        <button
          type="button"
          className="dup-btn adopt"
          onClick={onConfirm}
          disabled={busy || !writeEnabled}
          title={disabledTitle}
        >
          {Icon.check}
          {busy ? c.arbeitet : c.bestaetigen}
        </button>
      </div>
    </div>
  )
}

// Sprach-Anker re-export, falls Aufrufer die zwei Seiten direkt brauchen.
export const SEITEN = SEITE
