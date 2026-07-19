import { useState, type ReactNode } from 'react'
import type { Category } from '@shared/contract'
import { normalizeCat } from '@shared/cat-key'
import { msg } from '../../lib/messages'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import './ConfigDiagnostics.css'

interface Diagnostic {
  id: string
  title: string
  meaning: string
  importance: string
  action: string
  names?: string[]
  detail?: string
}

const ROSTER_LIMITS: Record<string, { max: number; title: string; technical: string }> = {
  skills: { max: 12, title: msg('configWarnings.title.manySkills'), technical: 'Skill-Roster' },
  agents: { max: 12, title: msg('configWarnings.title.manyAgents'), technical: 'Agenten-Roster' },
  teams: { max: 5, title: msg('configWarnings.title.manyTeams'), technical: 'Team-Roster' },
  plugins: { max: 12, title: msg('configWarnings.title.manyPlugins'), technical: 'Plugin-Roster' },
}

function fieldHas(fields: Record<string, string> | undefined, key: string): boolean {
  const needle = key.toLowerCase()
  if (!fields) return false
  if (Object.keys(fields).some((k) => k.toLowerCase() === needle)) return true
  return (fields.frontmatter ?? '').toLowerCase().split(/\s*,\s*/).includes(needle)
}

function frontmatterDiagnostics(cat: Category): Diagnostic[] {
  const hinted = cat.entries.filter((e) => e.fields?.['Frontmatter-Hinweis'])
  if (!hinted.length) return []
  return [{
    id: 'fileHeader',
    title: msg('configWarnings.title.fileHeader'),
    meaning: msg('configWarnings.meaning.fileHeader'),
    importance: msg('configWarnings.importance.fileHeader'),
    action: msg('configWarnings.action.fileHeader'),
    detail: `${hinted.length} Eintraege haben unbekannte oder wirkungslose Frontmatter-Schluessel.`,
    names: hinted.slice(0, 4).map((e) => e.name),
  }]
}

function ruleDiagnostics(cat: Category): Diagnostic[] {
  if (normalizeCat(cat.id) !== 'rules') return []
  const globs = cat.entries.filter((e) => fieldHas(e.fields, 'globs') && !fieldHas(e.fields, 'paths'))
  const always = cat.entries.filter((e) => !fieldHas(e.fields, 'paths'))
  const out: Diagnostic[] = []
  if (globs.length) {
    out.push({
      id: 'ruleScope',
      title: msg('configWarnings.title.ruleScope'),
      meaning: msg('configWarnings.meaning.ruleScope'),
      importance: msg('configWarnings.importance.ruleScope'),
      action: msg('configWarnings.action.ruleScope'),
      detail: `${globs.length} Rule${globs.length === 1 ? '' : 's'} nutzen globs statt paths und laden dadurch immer.`,
      names: globs.slice(0, 4).map((e) => e.name),
    })
  }
  if (always.length) {
    out.push({
      id: 'alwaysRules',
      title: msg('configWarnings.title.alwaysRules'),
      meaning: msg('configWarnings.meaning.alwaysRules'),
      importance: msg('configWarnings.importance.alwaysRules'),
      action: msg('configWarnings.action.alwaysRules'),
      detail: `${always.length} von ${cat.entries.length} Rules haben kein paths-Frontmatter und laden bei jedem Start.`,
    })
  }
  return out
}

function rosterDiagnostics(cat: Category): Diagnostic[] {
  const axis = normalizeCat(cat.id)
  const limit = ROSTER_LIMITS[axis]
  if (!limit || cat.entries.length <= limit.max) return []
  return [{
    id: `roster-${axis}`,
    title: limit.title,
    meaning: msg('configWarnings.meaning.largeRoster'),
    importance: msg('configWarnings.importance.largeRoster'),
    action: msg('configWarnings.action.largeRoster'),
    detail: `${limit.technical}: ${cat.entries.length} Eintraege gefunden; empfohlen sind hoechstens ${limit.max}.`,
  }]
}

function tokenDiagnostics(cat: Category): Diagnostic[] {
  const heavy = cat.entries.filter((e) => (e.tokensEstimated ?? 0) > 2000)
  if (!heavy.length) return []
  return [{
    id: 'largeSources',
    title: msg('configWarnings.title.largeSources'),
    meaning: msg('configWarnings.meaning.largeSources'),
    importance: msg('configWarnings.importance.largeSources'),
    action: msg('configWarnings.action.largeSources'),
    detail: `${heavy.length} Eintraege liegen ueber ca. 2.000 Tokens.`,
    names: heavy.slice(0, 4).map((e) => `${e.name} (ca. ${e.tokensEstimated} Tokens)`),
  }]
}

// Warnzeile im Kontrollbuch-Registerstil (F-WP6, wie ov-diag-row auf der
// Startseite): Status-Punkt, Titel, meaning als Kurzzeile, Chevron rechts.
// Aufgeklappt zeigen sich die Label-Bloecke; technicalDetail ist optional und
// wird vom Aufrufer modus-abhaengig (Experte) oder immer uebergeben.
export function ConfigWarningRow(props: {
  title: string
  meaning: string
  importance: string
  action: string
  expanded: boolean
  onToggle(): void
  technicalDetail?: ReactNode
}) {
  return (
    <article className="cfg-diag-row">
      <div className="cfg-diag-line">
        <button type="button" className="cfg-diag-toggle" aria-expanded={props.expanded} onClick={props.onToggle}>
          <span className="cfg-diag-dot" aria-hidden="true" />
          <span className="cfg-diag-main">
            <span className="cfg-diag-title">{props.title}</span>
            <span className="cfg-diag-sub">{props.meaning}</span>
          </span>
        </button>
        <button
          type="button"
          className="cfg-diag-chev"
          aria-expanded={props.expanded}
          aria-label={msg('diagnostics.row.toggle')}
          onClick={props.onToggle}
        >
          <span className={props.expanded ? 'cfg-diag-chevron expanded' : 'cfg-diag-chevron'} aria-hidden="true">{Icon.chev}</span>
        </button>
      </div>
      {props.expanded && (
        <div className="cfg-diag-details">
          <span><b>{msg('configWarnings.label.meaning')}</b>{props.meaning}</span>
          <span><b>{msg('configWarnings.label.importance')}</b>{props.importance}</span>
          <span><b>{msg('configWarnings.label.action')}</b>{props.action}</span>
          {props.technicalDetail && (
            <em><b>{msg('configWarnings.label.details')}</b>{props.technicalDetail}</em>
          )}
        </div>
      )}
    </article>
  )
}

export function toggleExpanded(current: Set<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function ConfigDiagnostics({ cat }: { cat: Category }) {
  const { ui } = useStore()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const items = [
    ...frontmatterDiagnostics(cat),
    ...ruleDiagnostics(cat),
    ...tokenDiagnostics(cat),
    ...rosterDiagnostics(cat),
  ]
  if (items.length === 0) return null
  const expert = ui.displayMode === 'expert'
  return (
    <div className="cfg-diag" role="status" aria-label="Config-Warnungen">
      {items.map((item) => (
        <ConfigWarningRow
          key={item.id}
          title={item.title}
          meaning={item.meaning}
          importance={item.importance}
          action={item.action}
          expanded={expanded.has(item.id)}
          onToggle={() => setExpanded((current) => toggleExpanded(current, item.id))}
          technicalDetail={expert && (item.detail || item.names)
            ? [item.detail, item.names?.join(', ')].filter(Boolean).join(' ')
            : undefined}
        />
      ))}
    </div>
  )
}
