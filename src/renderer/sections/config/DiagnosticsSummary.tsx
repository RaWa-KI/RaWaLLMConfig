import type { LlmConfig, ConfigEntry } from '@shared/contract'
import { Icon } from '../../components/Icon'
import './ConfigDiagnostics.css'

const ENTRY_TOKEN_LIMIT = 2000
const START_TOKEN_LIMIT = 25000

interface TokenItem {
  cat: string
  entry: ConfigEntry
  tokens: number
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
    .map((item) => `${item.entry.name} (${item.cat}, ca. ${item.tokens})`)
    .join(', ')
}

export function DiagnosticsSummary({ ad }: { ad: LlmConfig }) {
  const items = tokenItems(ad)
  const always = items.filter((item) => item.entry.loadMode === 'immer')
  const alwaysTotal = always.reduce((sum, item) => sum + item.tokens, 0)
  const heavy = items.filter((item) => item.tokens > ENTRY_TOKEN_LIMIT)
  const missing = missingDescriptions(ad)
  if (!alwaysTotal && heavy.length === 0 && missing.length === 0) return null
  return (
    <div className="cfg-diag cfg-diag-summary" role="status" aria-label="Startkontext-Warnungen">
      {alwaysTotal > 0 && (
        <div className="cfg-diag-item">
          <span className="cfg-diag-icon">{Icon.warn}</span>
          <span>
            <strong>Startkontext geschätzt</strong>
            <span>
              Always-on Quellen: ca. {alwaysTotal} Tokens
              {alwaysTotal > START_TOKEN_LIMIT ? ' — über dem Warnwert.' : '.'}
            </span>
          </span>
        </div>
      )}
      {heavy.length > 0 && (
        <div className="cfg-diag-item">
          <span className="cfg-diag-icon">{Icon.warn}</span>
          <span>
            <strong>Top-Tokenfresser</strong>
            <span>{topTokenNames(heavy)}</span>
          </span>
        </div>
      )}
      {missing.length > 0 && (
        <div className="cfg-diag-item">
          <span className="cfg-diag-icon">{Icon.warn}</span>
          <span>
            <strong>Routing-Metadaten fehlen</strong>
            <span>{missing.slice(0, 5).join(', ')}</span>
          </span>
        </div>
      )}
    </div>
  )
}
