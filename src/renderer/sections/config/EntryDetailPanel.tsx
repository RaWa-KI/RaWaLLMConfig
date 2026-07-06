import type { Category, ConfigEntry, LlmConfig } from '@shared/contract'
import { useStore } from '../../state/store'
import { Icon } from '../../components/Icon'
import { ExplainPanel } from '../../components/ExplainPanel'
import { DrawerEdit } from '../../components/DrawerEdit'
import { useExplain } from './use-explain'
import './EntryDetailPanel.css'

// EntryDetailPanel (Welle 3 / WP-INT-01) — haengt fuer den aktuell gewaehlten
// Eintrag (ui.sel) die Write-/Explain-Faehigkeit ein: DrawerEdit (read-only
// Default, owner-getriggerter Edit-Modus mit EntryActions + EditForm-Vollinhalt)
// + ExplainPanel ("Was macht das?" via config:explain). Rein komponierend; alle
// Mutation/IPC stecken in den eingehaengten Modulen (store-write / use-explain).
// Wird nur gerendert, wenn ein Eintrag offen ist; sonst null (kein Overhead).
function resolve(ad: LlmConfig, catId: string, entryId: string): { cat: Category; entry: ConfigEntry } | null {
  const cat = ad.categories.find((c) => c.id === catId)
  const entry = cat?.entries.find((e) => e.id === entryId)
  return cat && entry ? { cat, entry } : null
}

export function EntryDetailPanel({ ad }: { ad: LlmConfig }) {
  const { ui } = useStore()
  const found = ui.sel ? resolve(ad, ui.sel.catId, ui.sel.entryId) : null
  const explain = useExplain(found ? 'config-entry' : null, found ? found.entry.name : null)

  if (!found) return null
  return (
    <div className="entry-detail-panel">
      <div className="edp-head">
        <span className="edp-name mono">{found.entry.name}</span>
        <span className="edp-cat">{found.cat.label}</span>
      </div>
      {found.entry.status === 'conflict' && found.entry.conflictReason && (
        <div className="edp-conflict" role="alert">
          <span className="edp-conflict-ic">{Icon.warn}</span>
          <span className="edp-conflict-txt">
            <b>Konflikt:</b> {found.entry.conflictReason}
          </span>
        </div>
      )}
      <DrawerEdit cat={found.cat} entry={found.entry} />
      <ExplainPanel
        title={explain.title}
        text={explain.text}
        loading={explain.loading}
        error={explain.error}
      />
    </div>
  )
}
