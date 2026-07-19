import { useEffect, useState } from 'react'
import type { Category, ConfigEntry } from '@shared/contract'
import { useConfigTab } from './use-config-tab'
import { useStore } from '../state/store'
import { Icon } from '../components/Icon'
import { LineNumberedPre } from '../components/LineNumberedText'
import { Pill, ScopePill } from '../components/Pill'
import { DrawerDetailTab } from './DrawerDetailTab'
import './Drawer.css'

// Detail-Drawer: zeigt einen Eintrag in drei Reitern an.
// 'overview' = Kurz-Uebersicht, 'config' = Rohconfig, 'detail' = Edit + D-b.
type Tab = 'overview' | 'config' | 'detail'

interface Found {
  cat: Category
  entry: ConfigEntry
}

function findSel(cats: Category[] | undefined, catId: string, entryId: string): Found | null {
  const cat = cats?.find(c => c.id === catId)
  const entry = cat?.entries.find(e => e.id === entryId)
  return cat && entry ? { cat, entry } : null
}

export function Drawer() {
  const { config, ui, actions } = useStore()
  const [tab, setTab] = useState<Tab>('overview')
  const sel = ui.sel
  const found = sel ? findSel(config.data?.data[ui.llm]?.categories, sel.catId, sel.entryId) : null

  // Reiter zuruecksetzen, sobald ein anderer Eintrag geoeffnet wird.
  useEffect(() => {
    setTab('overview')
  }, [sel?.catId, sel?.entryId])

  const show = Boolean(sel && found)
  return (
    <>
      <div className={'drawer-back' + (show ? ' show' : '')} onClick={actions.closeEntry}></div>
      <aside className={'drawer' + (show ? ' show' : '')}>
        {found && (
          <DrawerInner
            cat={found.cat}
            entry={found.entry}
            tab={tab}
            setTab={setTab}
            close={actions.closeEntry}
            displayMode={ui.displayMode}
            openCompare={() => {
              const ids = found.cat.entries.filter((candidate) => candidate.path).map((candidate) => candidate.id)
              actions.setCompareSelection(ids)
              actions.closeEntry()
              actions.setMode('compare')
            }}
          />
        )}
      </aside>
    </>
  )
}

interface InnerProps {
  cat: Category
  entry: ConfigEntry
  tab: Tab
  setTab: (t: Tab) => void
  close: () => void
  displayMode: 'simple' | 'expert'
  openCompare(): void
}

const TABS: [Tab, string][] = [
  ['overview', 'Übersicht'],
  ['config', 'Konfiguration'],
  ['detail', 'Detail & Edit']
]

function DrawerInner({ cat, entry, tab, setTab, close, displayMode, openCompare }: InnerProps) {
  return (
    <>
      <div className="drawer-head">
        <div className="dh-ic">{Icon[cat.icon]}</div>
        <div>
          <h3>{entry.name}</h3>
          <div className="dh-sub">{entry.path}</div>
        </div>
        {/* drawer-close erhaelt margin-left:auto via Drawer.css */}
        <button type="button" className="drawer-close" onClick={close}>
          {Icon.x}
        </button>
      </div>
      <div className="drawer-tabs">
        {TABS.map(([id, label]) => (
          <button type="button" key={id} className={'drawer-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <ConflictBanner entry={entry} displayMode={displayMode} openCompare={openCompare} />
      <div className="drawer-body">
        {tab === 'overview' && <OverviewTab entry={entry} />}
        {tab === 'config' && <ConfigTab entry={entry} />}
        {tab === 'detail' && <DrawerDetailTab cat={cat} entry={entry} onCompare={openCompare} />}
      </div>
    </>
  )
}

// Konflikt-Banner: reiterunabhaengig sichtbar, sobald der Eintrag im Konflikt
// steht und einen Klartext-Grund traegt (was kollidiert, warum). Analog zum
// bewaehrten EntryDetailPanel-Banner (.edp-conflict).
function ConflictBanner({
  entry,
  displayMode,
  openCompare,
}: {
  entry: ConfigEntry
  displayMode: 'simple' | 'expert'
  openCompare(): void
}) {
  if (entry.status !== 'conflict' || !entry.conflictReason) return null
  return (
    <div className="drawer-conflict" role="alert">
      <span className="dc-ic">{Icon.warn}</span>
      <span className="drawer-conflict-main">
        <span className="drawer-conflict-summary">
          <b>Konflikt:</b> Dieser Eintrag passt nicht zu allen Stellen, die zusammengehören.
        </span>
        {displayMode === 'expert' && <span className="drawer-conflict-reason">{entry.conflictReason}</span>}
      </span>
      <button type="button" className="drawer-conflict-action" onClick={openCompare}>
        Unterschiede ansehen
      </button>
    </div>
  )
}

function OverviewTab({ entry }: { entry: ConfigEntry }) {
  const fields = Object.entries(entry.fields ?? {})
  return (
    <>
      {/* drawer-pills-row: flex-Zeile fuer Pills (via Drawer.css) */}
      <div className="drawer-pills-row">
        <Pill status={entry.status} />
        <ScopePill scope={entry.scope} />
        <span className="pill ghost">geändert {entry.updated}</span>
      </div>
      <div>
        <div className="sec-label">Was ist festgelegt</div>
        <div className="card flat">
          <div className="kv">
            {fields.map(([k, v]) => (
              <div className="kv-row" key={k}>
                <span className="kv-k">{k}</span>
                <span className="kv-v mono">{v}</span>
              </div>
            ))}
            <div className="kv-row">
              <span className="kv-k">Pfad</span>
              <span className="kv-v mono">{entry.path}</span>
            </div>
          </div>
        </div>
      </div>
      {entry.dupOf && (
        <div className="note-existing">
          {Icon.warn}
          <span>Existiert auch als Kopie. Im Reiter „Duplikate" der Kategorie abgleichen.</span>
        </div>
      )}
    </>
  )
}

// ConfigTab: zeigt zunächst den Kurz-Auszug (entry.code); per Button kann der
// vollständige Dateiinhalt per IPC geladen werden (readFull). Secret-Klasse wird
// maskiert angezeigt (Owner-Override). Fetch-/State-Logik liegt in useConfigTab.
function ConfigTab({ entry }: { entry: ConfigEntry }) {
  const { full, errText, loading, displayContent, handleShowFull } = useConfigTab(entry)
  return (
    <div>
      <div className="sec-label">Rohkonfiguration</div>
      {displayContent ? (
        <>
          {full?.masked && (
            <div className="codeblock-maskbadge">
              <span className="pill warn">Werte maskiert ({full.maskedCount})</span>
              <span className="codeblock-maskhint">
                Echte Secret-Werte sind durch ••• ersetzt (Anzeige).
              </span>
            </div>
          )}
          {/* codeblock-full: scrollbare Ansicht mit Höhenlimit (Drawer.css). */}
          <LineNumberedPre className={full ? 'codeblock codeblock-full' : 'codeblock'} content={displayContent} />
          {/* Button-Bereich nur sichtbar, solange Vollinhalt noch nicht geladen. */}
          {!full && (
            <div className="codeblock-actions">
              {errText ? (
                <span className="pill ghost codeblock-err">{errText}</span>
              ) : (
                <button type="button" className="btn-ghost" onClick={handleShowFull} disabled={loading}>
                  {loading ? 'Lädt …' : 'Vollständig anzeigen'}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="empty codeblock-empty">
          {errText ? <p>{errText}</p> : <p>Keine Rohkonfiguration hinterlegt.</p>}
        </div>
      )}
    </div>
  )
}
