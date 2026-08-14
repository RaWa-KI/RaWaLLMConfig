import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { useSources } from '../../state/useSources'
import { SourceRow } from './SourceRow'
import { AddSourceDialog } from './AddSourceDialog'
import { CloudProviderToggles } from './CloudProviderToggles'
import { ModuleFolderAssignments } from './ModuleFolderAssignments'
import { RootRows } from '../prefs/RootRows'
import { usePrefs } from '../../state/store-write-prefs'
import './quellen.css'

// Quellen-Verwaltung: zeigt die vom Owner registrierten Config-Ordner an und
// laesst ihn neue hinzufuegen, ein-/ausschalten oder entfernen. Liest und
// mutiert ausschliesslich ueber useSources() (getypte Bridge, im Main gegated).
// Standard-Ordner braucht der Owner hier nicht zu pflegen — sie werden ohnehin
// automatisch gelesen; diese Liste ergaenzt nur eigene Pfade.

export function SourcesSection() {
  const { actions } = useStore()
  const src = useSources()
  const { prefs, setPref } = usePrefs()
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
    <main id="settings-tab-sources" className="main qs-wrap">
      <div className="view-head qs-intro">
        <div className="view-title">
          <h2>Ordner</h2>
          <p>
            Hier legst du alle Ordner für diese App fest: Grundordner, weitere Einstellungen,
            lokale Modelle und optionale Module. Füge nur Ordner hinzu, die du nutzt oder die die App erkannt hat.
          </p>
        </div>
      </div>
      <section className="qs-root-card" aria-label="Grundordner">
        <RootRows prefs={prefs} onSet={(key, value) => void setPref(key, value)} />
      </section>
      <CloudProviderToggles />

      <SourcesHeader
        loading={src.loading}
        onSync={() => void syncAll()}
        onAdd={() => setAdding(true)}
      />

      <SourcesBody src={src} onToggle={onToggle} onRemove={onRemove} />

      <ModuleFolderAssignments />

      {adding && (
        <AddSourceHost src={src} onClose={() => setAdding(false)} onResult={onAddResult} />
      )}
    </main>
  )
}

// Offener Hinzufuegen-Dialog (nur gerendert, solange `adding` gesetzt ist).
function AddSourceHost(props: {
  src: ReturnType<typeof useSources>
  onClose(): void
  onResult(ok: boolean): void
}) {
  const { src, onClose, onResult } = props
  return (
    <AddSourceDialog
      providers={src.providers}
      pickFolder={src.pickFolder}
      addSource={src.addSource}
      onClose={onClose}
      onResult={(ok) => onResult(ok)}
    />
  )
}

// Kopfzeile: die weiteren Ordner ergaenzen alle oben erklärten Grundordner.
function SourcesHeader(props: { loading: boolean; onSync(): void; onAdd(): void }) {
  const { loading, onSync, onAdd } = props
  return (
    <div className="view-head">
      <div className="view-title">
        <h2>Weitere Konfigurations- und Modellordner</h2>
        <p>
          Konfigurationsordner enthalten Einstellungen. Lokale Modellordner enthalten Modelle.
          Wenn hier nichts steht, nutzt die App nur die Grundordner und erkannte Standardordner.
        </p>
      </div>
      <div className="qs-actions">
        <button type="button" className="btn-ghost" onClick={onSync} disabled={loading}>
          {Icon.refresh}
          Neu syncen
        </button>
        <button type="button" className="btn-ghost" onClick={onAdd} disabled={loading}>
          {Icon.plus}
          Ordner hinzufügen
        </button>
      </div>
    </div>
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
        <p>Lade Ordner …</p>
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
          Noch keine weiteren Ordner. Das ist normal: Die App nutzt nur Grundordner und erkannte
          Standardordner, bis du hier bewusst einen weiteren Ordner hinzufügst.
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
