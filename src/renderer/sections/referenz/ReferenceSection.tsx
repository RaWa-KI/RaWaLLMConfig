// src/renderer/sections/referenz/ReferenceSection.tsx
// Referenz-Sektion (Teil-A): Landkarte des Claude-/Codex-Vokabulars. Komponiert
// LLM-Switch + Artefakt-Tabs (Sidebar), Cross-Tab-Suche mit Treffer-Zaehlern,
// DriftBanner (Versionen live aus dem Watcher), FieldCards, Events/Vars/Notes,
// Geruest-Kopierblock und PortPanel (nur Claude). Ableitungen liegen in ref-logic.ts
// (HR27). Watcher/Config sind READ-ONLY; keine echten Secret-Werte.
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { RefArtifact } from '@shared/contract-referenz'
import { useStore } from '../../state/store'
import { msg } from '../../lib/messages'
import { Icon } from '../../components/Icon'
import { FieldCard } from './FieldCard'
import { CopyChip } from './CopyChip'
import { DriftBanner } from './DriftBanner'
import { PortPanel } from './PortPanel'
import { RefSidebar } from './ReferenceSidebar'
import {
  datasetForModel,
  firstArtifactId,
  referenceModels,
  type ReferenceMode
} from './reference-datasets'
import {
  countsByArtifact,
  driftItems,
  fieldMatches,
  sourceIsStale,
  usedArtifacts,
  versionsFromWatcher,
} from './ref-logic'
import './ReferenceSection.css'

// Surface-Kurzlabels (Richtwert) fuer die Artefakt-Kopfzeile.
const SURF: Record<string, string> = { cli: 'CLI', ide: 'IDE', desktop: 'Desktop', web: 'Web' }
const SURF_ORDER = ['cli', 'ide', 'desktop', 'web'] as const

// Kompakter Expert-Hinweis: nutzt vorhandene Artefaktdaten statt neuer IA.
function ExpertReferenceDetails({ art }: { art: RefArtifact }) {
  const events = art.events?.length ?? 0
  const vars = art.vars?.length ?? 0
  return (
    <div className="ref-expert-details" aria-label="Expert-Details">
      <span>
        <b>Pfad</b>
        <code>{art.file}</code>
      </span>
      <span>
        <b>Quelle</b>
        <span>{art.tag}</span>
      </span>
      <span>
        <b>Rohdaten</b>
        <span>{art.fields.length} Felder · {events + vars} Fundstellen</span>
      </span>
    </div>
  )
}

// Kopfzeile des aktiven Artefakts + Suchfeld (durchsucht alle Bereiche).
function RefHead({
  art,
  query,
  onQuery,
  expertMode,
}: {
  art: RefArtifact
  query: string
  onQuery(v: string): void
  expertMode: boolean
}) {
  return (
    <div className="view-head">
      <div className="view-title">
        <h2>{art.label}</h2>
        <p>
          {art.tag} · <span className="mono">{art.file}</span>
        </p>
        {art.surf && (
          <div className="art-surf">
            <span className="as-l">{Icon.globe}nutzbar in</span>
            {SURF_ORDER.map((s) => (
              <span
                key={s}
                className={'surf-badge ' + s + (art.surf?.includes(s) ? '' : ' off')}
              >
                {SURF[s]}
              </span>
            ))}
          </div>
        )}
        <p className="ref-intro">{msg(expertMode ? 'help.mode.expert' : 'help.mode.simple')}</p>
        {expertMode && <ExpertReferenceDetails art={art} />}
      </div>
      <div className="ref-search">
        {Icon.search}
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Über alle Bereiche suchen …"
          spellCheck={false}
        />
        {query && (
          <button type="button" className="ref-x" onClick={() => onQuery('')}>
            {Icon.x}
          </button>
        )}
      </div>
    </div>
  )
}

// Geruest-Kopierblock + die gefilterten FieldCards eines Artefakts.
function ArtBody({ art, query }: { art: RefArtifact; query: string }) {
  const ql = query.trim().toLowerCase()
  const fields = art.fields.filter((f) => fieldMatches(f, ql))
  return (
    <>
      {art.skeleton && (
        <div className="ref-skel">
          <div className="rs-head">
            <span className="rs-label">{Icon.list}Gerüst zum Übernehmen</span>
            <CopyChip text={art.skeleton} label="Gerüst kopieren" />
          </div>
          <pre className="rs-code">{art.skeleton}</pre>
        </div>
      )}
      {fields.length > 0 ? (
        <div className="ref-fields">{renderFields(fields, art.grouped)}</div>
      ) : (
        <div className="empty ref-empty">
          {Icon.search}
          <p>{ql ? 'Kein Treffer hier — siehe Zähler links für andere Bereiche.' : 'Für diese Auswahl liegen noch keine Einträge vor.'}</p>
        </div>
      )}
      <ArtExtras art={art} query={ql} />
    </>
  )
}

// FieldCards rendern, optional mit Gruppen-Trennern (Slash-Katalog).
function renderFields(fields: RefArtifact['fields'], grouped?: boolean) {
  if (!grouped) return fields.map((f) => <FieldCard key={f.id ?? f.key} field={f} />)
  const out: ReactElement[] = []
  let last: string | undefined
  for (const f of fields) {
    if (f.group && f.group !== last) {
      out.push(<div className="rf-group" key={'g:' + f.group}>{f.group}</div>)
      last = f.group
    }
    out.push(<FieldCard key={f.id ?? f.key} field={f} />)
  }
  return out
}

// Events / Variablen / Notes des Artefakts (jeweils nur bei Treffer/Inhalt).
function ArtExtras({ art, query }: { art: RefArtifact; query: string }) {
  const showEvents = art.events && (!query || art.events.some((e) => (e.key + ' ' + e.desc).toLowerCase().includes(query)))
  const showVars = art.vars && art.vars.length > 0 && (!query || art.vars.some((v) => (v.token + ' ' + v.desc).toLowerCase().includes(query)))
  return (
    <>
      {showEvents && art.events && (
        <div className="ref-block">
          <div className="ref-block-head">{Icon.hook}<h3>Events</h3><span>wann der Hook feuert</span></div>
          <div className="ref-rows">
            {art.events.map((e) => (
              <div className="ref-row" key={e.key}>
                <span className="rr-key"><span className="mono">{e.key}</span></span>
                <span className="rr-d">{e.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {showVars && art.vars && (
        <div className="ref-block">
          <div className="ref-block-head">{Icon.api}<h3>Variablen &amp; Platzhalter</h3><span>leicht zu vergessen</span></div>
          <div className="ref-rows">
            {art.vars.map((v) => (
              <div className="ref-row" key={v.token}>
                <span className="rr-key"><span className="mono">{v.token}</span></span>
                <span className="rr-d">{v.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {art.notes && art.notes.length > 0 && (
        <div className="ref-notes">
          {art.notes.map((n, i) => (
            <div className="ref-note" key={i}>{Icon.note}<span>{n}</span></div>
          ))}
        </div>
      )}
    </>
  )
}

export function ReferenceSection({ mode: initialMode = 'commands' }: { mode?: ReferenceMode }) {
  const { watcher, config, ui } = useStore()
  const [mode, setMode] = useState<ReferenceMode>(initialMode)
  const models = useMemo(() => referenceModels(config.data), [config.data])
  const [llm, setLlm] = useState(models[0]?.id ?? 'claude')
  useEffect(() => {
    if (!models.some((model) => model.id === llm)) setLlm(models[0]?.id ?? 'claude')
  }, [llm, models])
  const dataset = useMemo(() => datasetForModel(config.data, llm, mode), [config.data, llm, mode])
  const arts = dataset.artifacts
  const preferredArt = firstArtifactId(dataset, mode)
  const [artId, setArtId] = useState(preferredArt)
  useEffect(() => {
    if (!arts.some((artifact) => artifact.id === artId)) setArtId(preferredArt)
  }, [artId, arts, preferredArt])
  const [query, setQuery] = useState('')

  const ver = useMemo(() => versionsFromWatcher(watcher.data?.sources, llm), [watcher.data, llm])
  // Watcher-Quelle veraltet? Banner zeigt dann „ungewiss" statt „nutzt du".
  const stale = useMemo(() => sourceIsStale(watcher.data?.sources, llm), [watcher.data, llm])
  // „nutzt du" aus der echten Config (still aus ohne Daten).
  const used = useMemo(() => usedArtifacts(config.data?.data[llm]), [config.data, llm])
  const drift = useMemo(
    // cfg (config.data?.data[llm]) durchreichen, damit driftItems die Datei-Fundstellen
    // (occurrences -> „kommt vor in: <pfad>") befuellt; ohne cfg zeigt der Banner immer „keine Datei".
    () => driftItems(dataset, ver, watcher.data?.sources, llm, used, config.data?.data[llm]),
    [dataset, ver, watcher.data, llm, used, config.data],
  )
  const counts = useMemo(() => countsByArtifact(arts, query), [arts, query])

  const switchLlm = (id: string) => {
    setLlm(id)
    setQuery('')
  }
  const art = arts.find((a) => a.id === artId) ?? arts[0]

  return (
    <>
      <RefSidebar
        dataset={dataset}
        arts={arts}
        models={models}
        llm={llm}
        artId={art.id}
        counts={counts}
        query={query}
        mode={mode}
        onMode={(nextMode) => {
          setMode(nextMode)
          setQuery('')
        }}
        onLlm={switchLlm}
        onArt={(id) => setArtId(id)}
      />
      <main className="main refwrap">
        <RefHead art={art} query={query} onQuery={setQuery} expertMode={ui.displayMode === 'expert'} />
        <DriftBanner items={drift} installed={ver?.installed} latest={ver?.latest} stale={stale} />
        {art.intro && <p className="ref-intro">{art.intro}</p>}
        {mode === 'environment' && llm === 'claude' && <PortPanel artifactId={art.id} />}
        <ArtBody art={art} query={query} />
      </main>
    </>
  )
}
