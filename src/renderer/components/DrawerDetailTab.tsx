import { useEffect, useState } from 'react'
import type { Category, ConfigEntry } from '@shared/contract'
import type { CredentialMeta } from '@shared/contract-write'
import { useStore } from '../state/store'
import { ConflictResolution } from './ConflictResolution'
import { DrawerEdit } from './DrawerEdit'
import { ExplainPanel } from './ExplainPanel'
import { EnvMigrateButton } from '../sections/config/EnvMigrateButton'
import { useExplain } from '../sections/config/use-explain'

// DrawerDetailTab — dritter Drawer-Reiter (WP-D). Kanonische Detail-/Edit-Flaeche
// (P0: ersetzt den ausgehaengten EntryDetailPanel-Overlay). Komponiert:
//  - DrawerEdit (read-only Default, owner-getriggerter Edit-Modus)
//  - CredentialCard (wertfreier Hinweis + Env-Migrate, kein Reveal-/Maskier-Gate)
//  - ExplainPanel ("Was macht das?" familien-/kategoriespezifisch via cat.id + ui.llm)
// HR27: <300 Z, <50 Z/Funktion. Kein Secret-Wert in Logs (nur owner-sichtbares UI).

interface DetailTabProps {
  cat: Category
  entry: ConfigEntry
  onCompare(): void
}

// kind-Hygiene: explain-kind NICHT doppelt praefixen. Manche cat.id tragen die
// Familie bereits (z.B. "shared-agents", "codex-config-toml"); dann ist cat.id
// selbst der kind. Sonst "<familie>-<kategorie>" (z.B. "claude-hooks").
function explainKind(llm: string, catId: string): string {
  return /^(shared|codex)-/.test(catId) ? catId : `${llm}-${catId}`
}

export function DrawerDetailTab({ cat, entry, onCompare }: DetailTabProps) {
  const { ui } = useStore()
  const [editOpen, setEditOpen] = useState(false)
  // Stabiler kind-Bezug -> explain.ts leitet daraus Familie UND Element-Klasse ab
  // (classOf ist kind-getrieben; kein hartcodiertes GENERIC mehr).
  const explain = useExplain(explainKind(ui.llm, cat.id), entry.name)
  return (
    <div className="drawer-detail-tab">
      <ConflictResolution entry={entry} onEdit={() => setEditOpen(true)} onCompare={onCompare} />
      <DrawerEdit cat={cat} entry={entry} open={editOpen} onOpenChange={setEditOpen} />
      <CredentialCard entry={entry} />
      <ExplainPanel
        title={explain.title}
        text={explain.text}
        loading={explain.loading}
        error={explain.error}
      />
    </div>
  )
}

// CredentialCard — wertfreier Hinweis fuer erkannte Zugangsdaten. Die lokale
// Owner-Sicht selbst bleibt im Editor roh sichtbar; diese Karte zeigt nur Meta
// und optional den Env-Migrationspfad.
function CredentialCard({ entry }: { entry: ConfigEntry }) {
  const [cred, setCred] = useState<CredentialMeta | null>(null)

  // Initial-Read: Credential-Meta bestimmen; keine Werte in Logs/State ausser
  // dem ohnehin owner-sichtbaren Editorinhalt.
  useEffect(() => {
    setCred(null)
    if (!entry.path || !window.electronAPI?.readFull) return
    let alive = true
    void window.electronAPI.readFull({ path: entry.path }).then((res) => {
      if (!alive || !res.data) return
      if (res.data.credential?.hasSecret) setCred(res.data.credential)
    })
    return () => {
      alive = false
    }
  }, [entry.path])

  if (!cred) return null
  const kindLabel = cred?.secretKind ?? 'Secret'
  const needsEnv = Boolean(cred?.varSuggestion) && !cred?.alreadyVarRef
  return (
    <div className="secret-card card flat">
      <div className="secret-head">
        <span className="sec-label">Zugangsdaten erkannt</span>
        <span className="pill warn secret-kind">{kindLabel}</span>
        {needsEnv && <span className="pill ghost secret-needenv">User-Env nötig</span>}
      </div>
      {needsEnv && cred?.varSuggestion && (
        <p className="secret-hint">
          Empfehlung: Wert in eine Umgebungsvariable <span className="mono">{cred.varSuggestion}</span> auslagern
          (Config-Zeile auf <span className="mono">${'{'}…{'}'}</span> umstellen).
        </p>
      )}
      {entry.path && <EnvMigrateButton filePath={entry.path} cred={cred} />}
    </div>
  )
}
