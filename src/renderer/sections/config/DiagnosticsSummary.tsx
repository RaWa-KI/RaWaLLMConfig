import { useState } from 'react'
import type { LlmConfig, ConfigEntry } from '@shared/contract'
import { msg } from '../../lib/messages'
import { ConfigWarningRow, toggleExpanded } from './ConfigDiagnostics'
import './ConfigDiagnostics.css'

const ENTRY_TOKEN_LIMIT = 2000
const START_TOKEN_LIMIT = 25000

interface TokenItem {
  cat: string
  entry: ConfigEntry
  tokens: number
}

interface SummaryWarning {
  id: string
  title: string
  meaning: string
  importance: string
  action: string
  detail: string
}

function tokenItems(ad: LlmConfig): TokenItem[] {
  return ad.categories.flatMap((cat) =>
    cat.entries
      .filter((entry) => typeof entry.tokensEstimated === 'number')
      .map((entry) => ({ cat: cat.label, entry, tokens: entry.tokensEstimated! })),
  )
}

function missingDescriptions(ad: LlmConfig): string[] {
  return ad.categories
    .filter((cat) => ['skills', 'agents', 'codex-skills', 'codex-agents'].includes(cat.id))
    .flatMap((cat) => cat.entries.filter((entry) => !entry.fields?.description).map((entry) => entry.name))
}

function topTokenNames(items: TokenItem[]): string {
  return [...items]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5)
    .map((item) => `${item.entry.name} (${item.cat}, ca. ${item.tokens} Tokens)`)
    .join(', ')
}

function summaryWarnings(ad: LlmConfig): SummaryWarning[] {
  const items = tokenItems(ad)
  const alwaysTotal = items
    .filter((item) => item.entry.loadMode === 'immer')
    .reduce((sum, item) => sum + item.tokens, 0)
  const heavy = items.filter((item) => item.tokens > ENTRY_TOKEN_LIMIT)
  const missing = missingDescriptions(ad)
  const out: SummaryWarning[] = []
  if (alwaysTotal > 0) {
    out.push({
      id: 'startLoad',
      title: msg('configWarnings.title.startLoad'),
      meaning: msg('configWarnings.meaning.startLoad'),
      importance: msg('configWarnings.importance.startLoad'),
      action: alwaysTotal > START_TOKEN_LIMIT ? msg('configWarnings.action.startLoadHigh') : msg('configWarnings.action.startLoadObserve'),
      detail: `Always-on Quellen: ca. ${alwaysTotal} Tokens.`,
    })
  }
  if (heavy.length > 0) {
    out.push({
      id: 'heavyEntries',
      title: msg('configWarnings.title.heavyEntries'),
      meaning: msg('configWarnings.meaning.heavyEntries'),
      importance: msg('configWarnings.importance.heavyEntries'),
      action: msg('configWarnings.action.heavyEntries'),
      detail: topTokenNames(heavy),
    })
  }
  if (missing.length > 0) {
    out.push({
      id: 'missingDescriptions',
      title: msg('configWarnings.title.missingDescriptions'),
      meaning: msg('configWarnings.meaning.missingDescriptions'),
      importance: msg('configWarnings.importance.missingDescriptions'),
      action: msg('configWarnings.action.missingDescriptions'),
      detail: missing.slice(0, 5).join(', '),
    })
  }
  return out
}

export function DiagnosticsSummary({ ad }: { ad: LlmConfig }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const warnings = summaryWarnings(ad)
  if (warnings.length === 0) return null
  return (
    <div className="cfg-diag cfg-diag-summary" role="status" aria-label="Startkontext-Warnungen">
      {warnings.map((warning) => (
        <ConfigWarningRow
          key={warning.id}
          title={warning.title}
          meaning={warning.meaning}
          importance={warning.importance}
          action={warning.action}
          expanded={expanded.has(warning.id)}
          onToggle={() => setExpanded((current) => toggleExpanded(current, warning.id))}
          technicalDetail={warning.detail}
        />
      ))}
    </div>
  )
}
