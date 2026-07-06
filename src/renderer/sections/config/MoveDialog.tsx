import { useEffect, useMemo, useState } from 'react'
import type { MoveVersionedRequest } from '@shared/contract-write-rename'
import type { IntegrityPlan } from '@shared/contract-integrity'
import { Icon } from '../../components/Icon'
import { PathPicker } from './PathPicker'
import { SEITE_KURZ, SICHERUNG, VERSCHIEBEN, VERSCHIEBEN_KATEGORIEN, WRITE_AUS } from '@shared/dup-labels'
import {
  buildQuickPath, ensureFileTarget, endsOnFolder, isAbsolutePath,
  type MvVersion
} from './move-target'
import { useWriteConfig } from '../../state/store-write-config'
import { useIntegrity } from '../../state/store-write-integrity'
import { MovePlanSummary } from './MovePlanSummary'
import { moveRequests } from './MoveDialogImpact'
import { applyButtonLabel, applyPlans, planFacts, previewPlans } from './move-plan-controller'
import { buildWhatLabel, ChipRow, MvChips, MvField, pickerValue, sideLabel } from './MoveDialogParts'
import './MoveDialog.css'

// MoveDialog — wiederverwendbarer Verschieben-Dialog (v4 §Verschieben, Mockup-JS
// openMove/mvPick/mvBuildPath/doMove). Schnellwahl bekannter Ziele (Familie +
// Kategorie) + freier Ziel-Pfad (PathPicker) + Versions-Wahl + Live-Wirkungszeile
// + Sicherungs-Hinweis + Confirm. Schreibt NIE selbst: ruft `onMove` mit ECHTEM
// Quell-Pfad je gewaehlter Version. Generisch (Erweiterungs-Auflage 1: spaeterer
// Baum-Drag nutzt denselben Dialog): Pfade+Name rein, Callbacks raus.
//
// out-of-scope: Die Scope-Pruefung liegt MAIN-seitig (allowedRoots). Liefert der
// Move einen sanitisierten Fehler, zeigt der Dialog ihn verstaendlich an
// (Prop `errorText`) und bleibt offen, statt stumm zu schliessen.
//
// Sichtbare Texte aus @shared/dup-labels: Familie-Chips (SEITE_KURZ), Kategorie-
// Chips (VERSCHIEBEN_KATEGORIEN), Versions-Fragetext (VERSCHIEBEN.frageVersion)
// und Wirkungszeile (Quelle → Ziel → Wirkung). Die Pfad-Praefixe (MV_BASES) und
// reinen Pfad-Helfer liegen in move-target.ts (HR27-Split, kein React/JSX).
const MV_FAM_CHIPS: Array<{ val: string; label: string }> = [
  { val: 'shared', label: SEITE_KURZ.shared },
  { val: 'claude', label: SEITE_KURZ.claude },
  { val: 'codex', label: SEITE_KURZ.codex }
]
// Kategorie-Chips aus dem zentralen Sprach-Anker (mutable Kopie fuer ChipRow).
const MV_CAT_CHIPS: Array<{ val: string; label: string }> = [...VERSCHIEBEN_KATEGORIEN]

export interface MoveDialogProps {
  open: boolean
  // Name + Art nur fuer Anzeige/Pfadbau (kind = 'Datei' | 'Ordner').
  name: string
  kind?: 'Datei' | 'Ordner'
  // Anzahl Dateien (nur Anzeige bei Ordnern, „mit N Dateien").
  fileCount?: number
  // ECHTE Quell-Pfade je vorhandener Version (nie DuplicateSet.name).
  sharedPath?: string
  claudePath?: string
  // Schnellwahl-Quellen fuer den PathPicker (known-paths.ts).
  knownPaths: string[]
  busy?: boolean
  // Sanitisierter Fehler aus dem Main (z.B. out-of-scope) — bleibt sichtbar.
  errorText?: string | null
  // Wird je gewaehlter Version EINMAL aufgerufen (bei 'beide' fuer beide Seiten).
  onMove(req: MoveVersionedRequest): void | Promise<unknown>
  onClose(): void
}

// Lokaler Dialog-State + abgeleitete Werte (haelt die Komponente <50 Z, HR27).
interface MoveState {
  version: MvVersion
  setVersion(v: MvVersion): void
  fam: string
  cat: string
  pickFam(v: string): void
  pickCat(v: string): void
  // Roher Wert im Eingabefeld (frei tippbar, kann auf Ordner enden).
  target: string
  setTarget(v: string): void
  // Auswahl aus der PathPicker-Liste: Ordnerpfad + Dateiname ins Feld setzen,
  // damit der Owner den vollen Zielpfad sieht und anpassen kann.
  pickPath(v: string): void
  // Tatsaechliches Move-Ziel — bei kind='Datei' IMMER mit Dateiname (Datenverlust-Schutz).
  effPath: string
  // True, wenn das aktuelle Feld bei kind='Datei' (noch) keinen Dateinamen hat.
  missingFile: boolean
}

function useMoveState(kind: 'Datei' | 'Ordner', name: string, knownPaths: string[]): MoveState {
  const [version, setVersion] = useState<MvVersion>('claude')
  const [fam, setFam] = useState('shared')
  const [cat, setCat] = useState('skills')
  const [target, setTarget] = useState('')
  const quickPath = useMemo(() => buildQuickPath(fam, cat, kind, name, knownPaths), [fam, cat, kind, name, knownPaths])
  const folders = useMemo(() => new Set(knownPaths), [knownPaths])
  // Freier PathPicker-Wert hat Vorrang vor der Schnellwahl. effPath erzwingt
  // bei Dateien immer einen Dateinamen, missingFile zeigt eine Luecke fuer das
  // Eingabefeld an (verhindert blinden Move auf einen Ordner).
  const raw = target.trim() || quickPath
  return {
    version,
    setVersion,
    fam,
    cat,
    pickFam: (v) => { setFam(v); setTarget('') },
    pickCat: (v) => { setCat(v); setTarget('') },
    target,
    setTarget,
    pickPath: (v) => setTarget(ensureFileTarget(v, name, kind, folders)),
    effPath: ensureFileTarget(raw, name, kind, folders),
    missingFile: kind === 'Datei' && endsOnFolder(target.trim(), name, folders)
  }
}

export function MoveDialog(props: MoveDialogProps) {
  const { open, name, kind = 'Datei', fileCount, sharedPath, claudePath } = props
  const { knownPaths, busy = false, errorText, onClose } = props
  const { writeEnabled, writeReason } = useWriteConfig()
  const { preview, apply } = useIntegrity()
  // Zwei-Klick-Integrity: 1. Klick fuellt plans (Preview), 2. Klick fuehrt
  // jeden Plan gegen seinen planHash aus. busyLocal sperrt waehrend der IPC.
  const [plans, setPlans] = useState<IntegrityPlan[] | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busyLocal, setBusyLocal] = useState(false)
  const st = useMoveState(kind, name, knownPaths)
  // Bei jeder Zielaenderung den alten Plan verwerfen (planHash wuerde sonst
  // nicht mehr zum sichtbaren Ziel passen).
  useEffect(() => { setPlans(null); setPreviewError(null) }, [open, st.version, st.effPath, sharedPath, claudePath])
  if (!open) return null

  const whatLabel = buildWhatLabel(kind, name, fileCount)
  const reqs = moveRequests(st.version, sharedPath, claudePath, st.effPath)
  const facts = plans ? planFacts(plans) : null
  async function confirm() {
    if (!writeEnabled || busyLocal) return
    setBusyLocal(true)
    try {
      // 1. Klick: noch kein Plan -> Preview holen und anzeigen. Bei Fehler bleibt
      // plans null (kein []), damit Confirm im Pruef-Zustand bleibt und der Fehler
      // sichtbar wird, statt als leerer Plan einen Schein-Erfolg zu erzeugen.
      if (!plans) {
        const out = await previewPlans(reqs, preview)
        setPreviewError(out.error)
        setPlans(out.plans)
        return
      }
      // 2. Klick: Blocker sperren den Apply (Button ist disabled, hier safe-guard).
      if (planFacts(plans).hasBlockers) return
      const ok = await applyPlans(plans, apply)
      if (ok) onClose() // Reload/Toast erfolgt im useIntegrity-Hook.
    } finally {
      setBusyLocal(false)
    }
  }

  const isBusy = busy || busyLocal
  // Apply nur sperren, wenn ein Plan vorliegt UND Blocker enthaelt; sonst gelten
  // die normalen Ziel-Validierungen (absoluter Pfad, Dateiname, mind. 1 Request).
  const blocked = facts?.hasBlockers ?? false
  return (
    <MoveDialogFrame
      kind={kind} st={st} whatLabel={whatLabel} knownPaths={knownPaths}
      sharedPath={sharedPath} claudePath={claudePath} errorText={errorText ?? previewError}
      plans={plans} busy={isBusy} writeEnabled={writeEnabled} writeReason={writeReason}
      confirmDisabled={
        isBusy || !writeEnabled || !isAbsolutePath(st.effPath) ||
        st.missingFile || reqs.length === 0 || blocked
      }
      onConfirm={confirm}
      onClose={onClose}
    />
  )
}

interface MoveDialogFrameProps {
  kind: 'Datei' | 'Ordner'; st: MoveState; whatLabel: string; knownPaths: string[]
  sharedPath?: string; claudePath?: string; errorText?: string | null
  plans: IntegrityPlan[] | null; busy: boolean; writeEnabled: boolean
  writeReason: string | null; confirmDisabled: boolean; onConfirm(): void; onClose(): void
}

function MoveDialogFrame(p: MoveDialogFrameProps) {
  return (
    <div className="mvd-overlay" onClick={(e) => { if (e.target === e.currentTarget) p.onClose() }}>
      <div className="mvd-card" role="dialog" aria-modal="true">
        <div className="mvd-title">{p.kind === 'Ordner' ? 'Ganzen Ordner verschieben' : VERSCHIEBEN.titelDatei}</div>
        <MoveBody st={p.st} whatLabel={p.whatLabel} knownPaths={p.knownPaths} sharedPath={p.sharedPath} claudePath={p.claudePath} />
        <MoveFooter
          whatLabel={p.whatLabel}
          version={p.st.version}
          effPath={p.st.effPath}
          missingFile={p.st.missingFile}
          errorText={p.errorText}
          plans={p.plans}
          busy={p.busy}
          writeEnabled={p.writeEnabled}
          writeReason={p.writeReason}
          confirmDisabled={p.confirmDisabled}
          onConfirm={p.onConfirm}
          onClose={p.onClose}
        />
      </div>
    </div>
  )
}

interface MoveBodyProps {
  st: MoveState
  whatLabel: string
  knownPaths: string[]
  sharedPath?: string
  claudePath?: string
}

function MoveBody({ st, whatLabel, knownPaths, sharedPath, claudePath }: MoveBodyProps) {
  return (
    <>
      <MvField label={VERSCHIEBEN.frageWas}>
        <div className="mvd-value mono">{whatLabel}</div>
      </MvField>
      <MvChips
        label={VERSCHIEBEN.frageVersion}
        options={[
          { val: 'claude', label: SEITE_KURZ.claude, disabled: !claudePath },
          { val: 'shared', label: SEITE_KURZ.shared, disabled: !sharedPath },
          { val: 'beide', label: SEITE_KURZ.beide, disabled: !(sharedPath && claudePath) }
        ]}
        value={st.version}
        onPick={(v) => st.setVersion(v as MvVersion)}
      />
      <MvField label={VERSCHIEBEN.frageWohin}>
        <ChipRow options={MV_FAM_CHIPS} value={st.fam} onPick={st.pickFam} />
        <ChipRow options={MV_CAT_CHIPS} value={st.cat} onPick={st.pickCat} />
      </MvField>
      <MvField label={VERSCHIEBEN.frageZielpfad}>
        <PathPicker
          value={pickerValue(st)}
          onChange={st.setTarget}
          onSelect={st.pickPath}
          options={knownPaths}
          placeholder={VERSCHIEBEN.zielPlatzhalter}
        />
        <div className="mvd-sub">{VERSCHIEBEN.zielHinweis}</div>
      </MvField>
    </>
  )
}

interface MoveFooterProps {
  whatLabel: string; version: MvVersion; effPath: string
  missingFile: boolean  // True: Eingabefeld zeigt Ordner ohne Dateiname
  errorText?: string | null; plans: IntegrityPlan[] | null; busy: boolean
  writeEnabled: boolean; writeReason: string | null
  confirmDisabled: boolean; onConfirm(): void; onClose(): void
}

function MoveFooter(p: MoveFooterProps) {
  const confirmTitle = !p.writeEnabled ? (p.writeReason ?? WRITE_AUS) : undefined
  // Vor dem 1. Klick (kein Plan): „Verschieben prüfen". Mit Plan: Wortlaut je
  // Plan-Zustand (Referenzen mitziehen / nur verschieben / manuell erforderlich).
  const confirmText = p.plans ? applyButtonLabel(p.plans) : VERSCHIEBEN.bestaetigen
  return (
    <>
      <div className="mvd-effect">
        {/* Wortlaut deckungsgleich mit verschiebenWirkung() (@shared/dup-labels);
            hier mit <strong>-Hervorhebung gerendert, daher inline statt flacher Helper. */}
        <strong>{p.whatLabel}</strong> ({sideLabel(p.version)}) wandert nach <strong>{p.effPath}</strong> ·{' '}
        {SICHERUNG.vorher}.
      </div>
      {p.plans ? <MovePlanSummary plans={p.plans} /> : null}
      {p.missingFile && (
        <div className="mvd-error">
          {Icon.warn}
          <span>Das Ziel ist ein Ordner ohne Dateiname — bitte den Dateinamen ergänzen, sonst kann nicht verschoben werden.</span>
        </div>
      )}
      {p.errorText && (
        <div className="mvd-error">
          {Icon.warn}
          <span>{p.errorText}</span>
        </div>
      )}
      <div className="mvd-btns">
        <button type="button" className="mvd-btn ghost" onClick={p.onClose} disabled={p.busy}>
          {VERSCHIEBEN.abbrechen}
        </button>
        <button
          type="button"
          className="mvd-btn primary"
          onClick={p.onConfirm}
          disabled={p.confirmDisabled}
          title={confirmTitle}
        >
          {Icon.check}
          {p.busy ? 'Arbeitet …' : confirmText}
        </button>
      </div>
    </>
  )
}
