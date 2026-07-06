import type { Category } from '@shared/contract'
import { normalizeCat } from '@shared/cat-key'
import { Icon } from '../../components/Icon'
import './ConfigDiagnostics.css'

interface Diagnostic {
  title: string
  body: string
  names?: string[]
}

const ROSTER_LIMITS: Record<string, { max: number; label: string }> = {
  skills: { max: 12, label: 'Skill-Roster' },
  agents: { max: 12, label: 'Agenten-Roster' },
  teams: { max: 5, label: 'Team-Roster' },
  plugins: { max: 12, label: 'Plugin-Roster' },
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
    title: 'Frontmatter prüfen',
    body: `${hinted.length} Eintraege haben unbekannte oder wirkungslose Frontmatter-Schluessel.`,
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
      title: 'Unwirksames Frontmatter',
      body: `${globs.length} Rule${globs.length === 1 ? '' : 's'} nutzen globs statt paths und laden dadurch immer.`,
      names: globs.slice(0, 4).map((e) => e.name),
    })
  }
  if (always.length) {
    out.push({
      title: 'Always-on Rules',
      body: `${always.length} von ${cat.entries.length} Rules haben kein paths-Frontmatter und kosten bei jedem Start Kontext.`,
    })
  }
  return out
}

function rosterDiagnostics(cat: Category): Diagnostic[] {
  const axis = normalizeCat(cat.id)
  const limit = ROSTER_LIMITS[axis]
  if (!limit || cat.entries.length <= limit.max) return []
  return [{
    title: `${limit.label} gross`,
    body: `${cat.entries.length} Eintraege gefunden; oberhalb von ${limit.max} sollte die App zum Ausmisten oder Verschieben auffordern.`,
  }]
}

function tokenDiagnostics(cat: Category): Diagnostic[] {
  const heavy = cat.entries.filter((e) => (e.tokensEstimated ?? 0) > 2000)
  if (!heavy.length) return []
  return [{
    title: 'Grosse Kontextquellen',
    body: `${heavy.length} Eintraege liegen ueber ca. 2.000 Tokens und sollten ausgelagert oder gesplittet werden.`,
    names: heavy.slice(0, 4).map((e) => `${e.name} (ca. ${e.tokensEstimated})`),
  }]
}

export function ConfigDiagnostics({ cat }: { cat: Category }) {
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
        <div className="cfg-diag-item" key={item.title}>
          <span className="cfg-diag-icon">{Icon.warn}</span>
          <span>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
            {item.names && <em>{item.names.join(', ')}</em>}
          </span>
        </div>
      ))}
    </div>
  )
}
