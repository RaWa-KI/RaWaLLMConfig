import { useMemo, useState } from 'react'
import type { GraphNode, GraphLink } from '@shared/contract-graph'
import { Icon } from '../../components/Icon'
import { appendGraphignoreRulesForNodes } from './graphIgnoreActions'
import { GraphActionFeedback, GraphConfirm, type GraphActionState } from './GraphIgnoreActionUi'

// Orphan-Triage-Leaf (WP-B2): praesentational, props-getrieben. Ein Orphan ist
// ein Knoten, dessen id in keiner Kante (source/target) vorkommt. Orphans werden
// in Kandidatenklassen sortiert (Prototyp `classMeta`). Klasse `code_or_config`
// ist DEFAULT AUSGEBLENDET (Code/Config sind meist legitime Blaetter, kein Leck)
// und nur ueber den Toggle sichtbar. Nur Metadaten (id/file_type), kein Inhalt.

// Eine Kandidatenklasse mit Anzeige-Meta (Label, Badge-Variante, Empfehlung).
interface OrphanClass {
  key: string
  label: string
  badge: string
  action: string
  defaultHidden: boolean
}

interface ClassBucket {
  meta: OrphanClass
  count: number
  items: string[]
  allItems: string[]
}

// Klassen-Definition orientiert an Prototyp `classMeta`. Reihenfolge = Anzeige.
const CLASSES: OrphanClass[] = [
  { key: 'docs', label: 'Dokumente', badge: 'dep', action: 'Wikilink ergänzen oder bewusst Orphan', defaultHidden: false },
  { key: 'image', label: 'Bilder', badge: 'ren', action: 'Einbettung prüfen', defaultHidden: false },
  { key: 'data', label: 'Daten', badge: 'def', action: 'Referenz oder Ignore-Regel prüfen', defaultHidden: false },
  { key: 'code_or_config', label: 'Code / Config', badge: 'new', action: 'meist legitimes Blatt — selten Leck', defaultHidden: true },
  { key: 'other', label: 'Sonstige', badge: 'muted', action: 'manuell sichten', defaultHidden: false }
]

const DOCS_RX = /\.(md|markdown|mdx|txt|rst|adoc)$/i
const IMG_RX = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)$/i
const DATA_RX = /\.(json|ya?ml|toml|csv|tsv|xml|sql|ndjson)$/i
const CODE_RX = /\.(ts|tsx|js|jsx|mjs|cjs|css|scss|less|php|py|sh|ps1|html?)$/i

// Mappt einen Knoten anhand file_type oder id-Endung auf einen Klassen-Key.
function classifyNode(node: GraphNode): string {
  const probe = (node.file_type ?? '') + ' ' + node.id
  if (DOCS_RX.test(probe)) return 'docs'
  if (IMG_RX.test(probe)) return 'image'
  if (CODE_RX.test(probe)) return 'code_or_config'
  if (DATA_RX.test(probe)) return 'data'
  return 'other'
}

// Sammelt alle Knoten-ids, die in mindestens einer Kante vorkommen.
function linkedIds(links: GraphLink[]): Set<string> {
  const set = new Set<string>()
  for (const l of links) {
    set.add(l.source)
    set.add(l.target)
  }
  return set
}

// Berechnet je Klasse Count + bis zu 8 Beispiel-ids (rein, keine Mutation).
function buildBuckets(nodes: GraphNode[], links: GraphLink[]): ClassBucket[] {
  const linked = linkedIds(links)
  const byKey = new Map<string, string[]>()
  for (const n of nodes) {
    if (linked.has(n.id)) continue
    const key = classifyNode(n)
    const arr = byKey.get(key) ?? []
    arr.push(n.id)
    byKey.set(key, arr)
  }
  return CLASSES.map((meta) => {
    const ids = byKey.get(meta.key) ?? []
    return { meta, count: ids.length, items: ids.slice(0, 8), allItems: ids }
  }).filter((b) => b.count > 0)
}

function OrphanRow({ bucket, nodes }: { bucket: ClassBucket; nodes: GraphNode[] }) {
  const { count } = bucket
  const [state, setState] = useState<GraphActionState>({ phase: 'idle' })

  async function ignoreDataOrphans() {
    setState({ phase: 'saving' })
    try {
      const res = await appendGraphignoreRulesForNodes(nodes, bucket.allItems)
      setState(res.ok ? { phase: 'done', result: res } : { phase: 'error', msg: res.error })
    } catch (err) {
      setState({ phase: 'error', msg: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    }
  }

  return (
    <div className="tri-stack">
      <OrphanLine bucket={bucket} saving={state.phase === 'saving'} onIgnore={() => setState({ phase: 'confirm' })} />
      {state.phase === 'confirm' && (
        <GraphConfirm
          title={`${count.toLocaleString('de')} Daten-Orphans in .graphignore schreiben?`}
          text="Es werden exakte Graph-IDs ergänzt; bestehende Regeln bleiben erhalten."
          onCancel={() => setState({ phase: 'idle' })}
          onConfirm={() => void ignoreDataOrphans()}
        />
      )}
      <GraphActionFeedback
        state={state}
        okText={state.phase === 'done' ? `${state.result.added.toLocaleString('de')} Regeln gespeichert` : ''}
      />
    </div>
  )
}

function OrphanLine(props: { bucket: ClassBucket; saving: boolean; onIgnore(): void }) {
  const { bucket, saving, onIgnore } = props
  const { meta, count, items } = bucket
  return (
    <div className="tri-row">
      <span className={'rf-badge ' + meta.badge}>{count.toLocaleString('de')}</span>
      <div className="tri-main">
        <div className="tri-name">
          {meta.label}
          <span className="tri-key mono">{meta.key}</span>
        </div>
        <div className="tri-action">{Icon.arrow}{meta.action}</div>
        {items.length > 0 && <OrphanSamples items={items} />}
      </div>
      {meta.key === 'data' && (
        <button type="button" className="ign-save" disabled={saving} onClick={onIgnore}>
          {Icon.save}Ignorieren
        </button>
      )}
    </div>
  )
}

function OrphanSamples({ items }: { items: string[] }) {
  return (
    <div className="tri-items">
      {items.map((it) => (
        <code key={it}>{it}</code>
      ))}
    </div>
  )
}

export function OrphanTriage({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }) {
  const [showCode, setShowCode] = useState(false)
  const buckets = useMemo(() => buildBuckets(nodes, links), [nodes, links])

  const visible = buckets.filter((b) => !b.meta.defaultHidden || showCode)
  const hiddenCount = buckets
    .filter((b) => b.meta.defaultHidden)
    .reduce((s, b) => s + b.count, 0)

  return (
    <div className="gblock">
      <div className="gblock-head">
        {Icon.list}
        <h3>Orphan-Triage</h3>
        <span>nach Kandidatenklasse</span>
        {hiddenCount > 0 && (
          <button
            type="button"
            className={'pill ' + (showCode ? 'active' : 'ghost')}
            style={{ marginLeft: 'auto' }}
            onClick={() => setShowCode((v) => !v)}
          >
            {showCode
              ? 'Code/Config ausblenden'
              : `auch Code/Config zeigen (${hiddenCount.toLocaleString('de')})`}
          </button>
        )}
      </div>
      <div className="triage">
        {visible.length === 0 ? (
          <div className="gph-empty">Keine Orphans in den sichtbaren Klassen.</div>
        ) : (
          visible.map((b) => <OrphanRow key={b.meta.key} bucket={b} nodes={nodes} />)
        )}
      </div>
    </div>
  )
}
