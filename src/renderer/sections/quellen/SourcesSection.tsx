import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { useSources } from '../../state/useSources'
import { SourceRow } from './SourceRow'
import { AddSourceDialog } from './AddSourceDialog'
import './quellen.css'

// Quellen-Verwaltung: zeigt die vom Owner registrierten Config-Ordner an und
// laesst ihn neue hinzufuegen, ein-/ausschalten oder entfernen. Liest und
// mutiert ausschliesslich ueber useSources() (getypte Bridge, im Main gegated).
// Standard-Ordner braucht der Owner hier nicht zu pflegen — sie werden ohnehin
// automatisch gelesen; diese Liste ergaenzt nur eigene Pfade.

export function SourcesSection() {
  const { actions } = useStore()
  const src = useSources()
  const [adding, setAdding] = useState(false)

  async function syncAll(msg = 'Quellen neu synchronisiert'): Promise<void> {
    await src.reload()
    actions.reload()
    actions.showToast(msg, 'refresh')
  }

  function onToggle(id: string, enabled: boolean): void {
    void src.setEnabled(id, enabled).then(async (ok) => {
      if (ok) actions.showToast(enabled ? 'Quelle aktiviert' : 'Quelle deaktiviert', 'check')
      else actions.showToast('Umschalten fehlgeschlagen', 'warn')
      if (ok) await syncAll('Quelle gespeichert und Scanner aktualisiert')
    })
  }

  function onRemove(id: string): void {
    void src.removeSource(id).then(async (ok) => {
      actions.showToast(ok ? 'Quelle entfernt' : 'Entfernen fehlgeschlagen', ok ? 'check' : 'warn')
      if (ok) await syncAll('Quelle entfernt und Scanner aktualisiert')
    })
  }

  function onAddResult(ok: boolean): void {
    actions.showToast(ok ? 'Quelle hinzugefügt' : 'Hinzufügen fehlgeschlagen', ok ? 'check' : 'warn')
    if (ok) void syncAll('Quelle hinzugefügt und Scanner aktualisiert')
  }

  return (
    <main className="main qs-wrap">
      <div className="view-head">
        <div className="view-title">
          <h2>Config-Quellen</h2>
          <p>
            Diese Ordner durchsucht die App zusätzlich nach Config-Dateien. Die Standard-Ordner
            werden ohnehin gelesen — hier ergänzt du nur eigene Pfade.
          </p>
        </div>
        <div className="qs-actions">
          <button type="button" className="btn-ghost" onClick={() => void syncAll()} disabled={src.loading}>
            {Icon.refresh}
            Neu syncen
          </button>
          <button type="button" className="btn-ghost" onClick={() => setAdding(true)} disabled={src.loading}>
            {Icon.plus}
            Quelle hinzufügen
          </button>
        </div>
      </div>

      <SourcesBody src={src} onToggle={onToggle} onRemove={onRemove} />

      {adding && (
        <AddSourceDialog
          providers={src.providers}
          pickFolder={src.pickFolder}
          addSource={src.addSource}
          onClose={() => setAdding(false)}
          onResult={(ok) => onAddResult(ok)}
        />
      )}
    </main>
  )
}

// Lade-/Fehler-/Leer-Zustaende + Liste. Konklusion vor Detail.
function SourcesBody(props: {
  src: ReturnType<typeof useSources>
  onToggle(id: string, enabled: boolean): void
  onRemove(id: string): void
}) {
  const { src, onToggle, onRemove } = props
  if (src.loading) {
    return (
      <div className="empty">
        {Icon.refresh}
        <p>Lade Quellen …</p>
      </div>
    )
  }
  if (src.error) {
    return (
      <div className="empty qs-error">
        {Icon.warn}
        <p>Fehler: {src.error}</p>
      </div>
    )
  }
  if (src.sources.length === 0) {
    return (
      <div className="empty">
        {Icon.folder}
        <p>
          Noch keine eigenen Quellen — die App nutzt die Standard-Ordner. Mit „Quelle hinzufügen“
          wählst du weitere Ordner.
        </p>
      </div>
    )
  }
  return (
    <ul className="qs-list">
      {src.sources.map((s) => (
        <SourceRow
          key={s.id}
          source={s}
          providers={src.providers}
          onToggle={onToggle}
          onRemove={onRemove}
        />
      ))}
    </ul>
  )
}
