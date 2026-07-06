import { useState } from 'react'
import type { AddSourceRequest, ProviderChoice } from '@shared/contract-sources'
import { Icon } from '../../components/Icon'

// Dialog zum Hinzufuegen einer neuen Config-Quelle. Schritte fuer den Owner:
// 1) Ordner waehlen (oeffnet den System-Ordner-Dialog ueber pickFolder),
// 2) Provider zuordnen, 3) optional einen eigenen Namen vergeben.
// Hinzufuegen ist erst moeglich, wenn Ordner UND Provider gesetzt sind. Die
// Modal-Huelle nutzt das vorhandene itd-Pattern (siehe ImportTargetDialog).

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
        <div className="itd-head">
          <span className="itd-ic">{Icon.folder}</span>
          <h3>Quelle hinzufügen</h3>
        </div>
        <p className="itd-detail">
          Wähle einen Ordner, den die App zusätzlich nach Config-Dateien durchsuchen soll, und ordne
          ihn einem Werkzeug zu.
        </p>

        <div className="qs-field">
          <span className="qs-field-lbl">1 · Ordner</span>
          <div className="qs-pick">
            <button type="button" className="btn-ghost sm" onClick={() => void choose()}>
              {Icon.folder}
              Ordner wählen
            </button>
            <span className={'qs-pick-val mono' + (root ? '' : ' qs-pick-empty')}>
              {root ?? 'Noch kein Ordner gewählt'}
            </span>
          </div>
        </div>

        <label className="qs-field">
          <span className="qs-field-lbl">2 · Werkzeug</span>
          <select
            className="qs-select"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            aria-label="Werkzeug für diese Quelle"
          >
            {providers.length === 0 && <option value="">Keine Werkzeuge verfügbar</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="qs-field">
          <span className="qs-field-lbl">3 · Name (optional)</span>
          <input
            className="qs-input"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Leer lassen = Ordnername wird genutzt"
          />
        </label>

        <div className="itd-actions">
          <button type="button" className="itd-btn ghost" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button type="button" className="itd-btn primary" onClick={() => void submit()} disabled={!canAdd}>
            {busy ? 'Wird hinzugefügt …' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}
