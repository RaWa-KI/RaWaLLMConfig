import { useState } from 'react'
import type { AddSourceRequest, ProviderChoice } from '@shared/contract-sources'
import { Icon } from '../../components/Icon'

// Dialog zum Hinzufuegen einer neuen Config-Quelle. Schritte fuer den Owner:
// 1) Ordner waehlen (oeffnet den System-Ordner-Dialog ueber pickFolder),
// 2) Provider zuordnen, 3) optional einen eigenen Namen vergeben.
// Hinzufuegen ist erst moeglich, wenn Ordner UND Provider gesetzt sind. Die
// Modal-Huelle nutzt das vorhandene itd-Pattern (siehe ImportTargetDialog).
// WP-6 (B8): Der Intro-Text erklaert laienverstaendlich, WANN ein zusaetzlicher
// Ordner ueberhaupt noetig ist (die Standard-Ordner liest die App ohnehin).

interface AddSourceDialogProps {
  providers: ProviderChoice[]
  pickFolder(): Promise<string | null>
  addSource(req: AddSourceRequest): Promise<boolean>
  onClose(): void
  onResult(ok: boolean, root: string): void
}

export function AddSourceDialog({ providers, pickFolder, addSource, onClose, onResult }: AddSourceDialogProps) {
  const [root, setRoot] = useState<string | null>(null)
  const [providerId, setProviderId] = useState<string>(providers[0]?.id ?? '')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const canAdd = Boolean(root) && Boolean(providerId) && !busy

  async function choose() {
    const picked = await pickFolder()
    if (picked) setRoot(picked)
  }

  async function submit() {
    if (!root || !providerId) return
    setBusy(true)
    const ok = await addSource({ root, providerId, label: label.trim() || undefined })
    setBusy(false)
    if (ok) {
      onResult(true, root)
      onClose()
    } else {
      onResult(false, root)
    }
  }

  return (
    <div className="itd-back" onClick={onClose}>
      <div className="itd-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <DialogHead />
        <FolderField root={root} onChoose={() => void choose()} />
        <ProviderField providers={providers} providerId={providerId} onChange={setProviderId} />
        <LabelField label={label} onChange={setLabel} />
        <DialogActions busy={busy} canAdd={canAdd} onClose={onClose} onSubmit={() => void submit()} />
      </div>
    </div>
  )
}

// Titel + Guidance: wann ein zusaetzlicher Ordner noetig ist (B8).
function DialogHead() {
  return (
    <>
      <div className="itd-head">
        <span className="itd-ic">{Icon.folder}</span>
        <h3>Quelle hinzufügen</h3>
      </div>
      <p className="itd-detail">
        Die App liest die Standard-Ordner deiner Werkzeuge (z. B. .claude und .codex in deinem
        Benutzerordner) automatisch mit. Einen zusätzlichen Ordner brauchst du nur, wenn
        Einstellungsdateien an einem anderen Ort liegen — etwa in einem eigenen Projekt- oder
        Sicherungsordner. Wähle diesen Ordner und ordne ihn dem passenden Werkzeug zu.
      </p>
    </>
  )
}

// Schritt 1: Ordner ueber den System-Dialog waehlen.
function FolderField({ root, onChoose }: { root: string | null; onChoose(): void }) {
  return (
    <div className="qs-field">
      <span className="qs-field-lbl">1 · Ordner</span>
      <div className="qs-pick">
        <button type="button" className="btn-ghost sm" onClick={onChoose}>
          {Icon.folder}
          Ordner wählen
        </button>
        <span className={'qs-pick-val mono' + (root ? '' : ' qs-pick-empty')}>
          {root ?? 'Noch kein Ordner gewählt'}
        </span>
      </div>
    </div>
  )
}

// Schritt 2: Werkzeug (Provider) zuordnen — Liste kommt aus der Registry.
function ProviderField(props: {
  providers: ProviderChoice[]
  providerId: string
  onChange(id: string): void
}) {
  const { providers, providerId, onChange } = props
  return (
    <label className="qs-field">
      <span className="qs-field-lbl">2 · Werkzeug</span>
      <select
        className="qs-select"
        value={providerId}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Werkzeug für diese Quelle"
      >
        {providers.length === 0 && <option value="">Keine Werkzeuge verfügbar</option>}
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
    </label>
  )
}

// Schritt 3: optionaler eigener Anzeigename (Default = Ordnername).
function LabelField({ label, onChange }: { label: string; onChange(next: string): void }) {
  return (
    <label className="qs-field">
      <span className="qs-field-lbl">3 · Name (optional)</span>
      <input
        className="qs-input"
        type="text"
        value={label}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Leer lassen = Ordnername wird genutzt"
      />
    </label>
  )
}

// Dialog-Fuss: Abbrechen immer moeglich, Hinzufuegen erst bei Ordner + Werkzeug.
function DialogActions(props: {
  busy: boolean
  canAdd: boolean
  onClose(): void
  onSubmit(): void
}) {
  const { busy, canAdd, onClose, onSubmit } = props
  return (
    <div className="itd-actions">
      <button type="button" className="itd-btn ghost" onClick={onClose} disabled={busy}>
        Abbrechen
      </button>
      <button type="button" className="itd-btn primary" onClick={onSubmit} disabled={!canAdd}>
        {busy ? 'Wird hinzugefügt …' : 'Hinzufügen'}
      </button>
    </div>
  )
}
