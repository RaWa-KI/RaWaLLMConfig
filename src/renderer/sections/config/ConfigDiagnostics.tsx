import type { Category } from '@shared/contract'
import { normalizeCat } from '@shared/cat-key'
import { msg } from '../../lib/messages'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import type { DisplayMode } from '../../state/types'
import './ConfigDiagnostics.css'

interface Diagnostic {
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
    title: msg('configWarnings.title.largeSources'),
    meaning: msg('configWarnings.meaning.largeSources'),
    importance: msg('configWarnings.importance.largeSources'),
    action: msg('configWarnings.action.largeSources'),
    detail: `${heavy.length} Eintraege liegen ueber ca. 2.000 Tokens.`,
    names: heavy.slice(0, 4).map((e) => `${e.name} (ca. ${e.tokensEstimated} Tokens)`),
  }]
}

function DiagnosticItem({ item, displayMode }: { item: Diagnostic; displayMode: DisplayMode }) {
  const showDetails = displayMode === 'expert'
  return (
    <div className="cfg-diag-item">
      <span className="cfg-diag-icon">{Icon.warn}</span>
      <span>
        <strong>{item.title}</strong>
        <span><b>{msg('configWarnings.label.meaning')}</b>{item.meaning}</span>
        <span><b>{msg('configWarnings.label.importance')}</b>{item.importance}</span>
        <span><b>{msg('configWarnings.label.action')}</b>{item.action}</span>
        {showDetails && (item.detail || item.names) && (
          <em>
            <b>{msg('configWarnings.label.details')}</b>
            {[item.detail, item.names?.join(', ')].filter(Boolean).join(' ')}
          </em>
        )}
      </span>
    </div>
  )
}

export function ConfigDiagnostics({ cat }: { cat: Category }) {
  const { ui } = useStore()
  const items = [
    ...frontmatterDiagnostics(cat),
    ...ruleDiagnostics(cat),
    ...tokenDiagnostics(cat),
    ...rosterDiagnostics(cat),
  ]
  if (items.length === 0) return null
  return (
    <div className="cfg-diag" role="status" aria-label="Config-Warnungen">
      {items.map((item) => (
        <DiagnosticItem item={item} displayMode={ui.displayMode} key={item.title} />
      ))}
    </div>
  )
}
