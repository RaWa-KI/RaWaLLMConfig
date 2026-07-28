import { normalizeCat } from '@shared/cat-key'
import type { DisplayMode } from '../../state/types'
import { isMessageKey, msgMode } from '../../lib/messages'
import type { MessageKey } from '../../lib/messages'

// Registrierte Kategorie-Keys der Config-Projektion (alle ohne Parameter).
type CategoryMessageKey = Extract<MessageKey, `config.category.${string}`>

// Kategorie-Anzeigename je DisplayMode (Teil E, Owner-Entscheid D1–D3, 2026-07-18):
// simple bekommt Alltagsnamen aus der Message-Projektion (`config.category.<achse>.simple`),
// expert das bisherige technische Label (Basis-Key = Scanner-Label). Die Achse folgt
// shared/cat-key.ts (normalizeCat strippt shared-/codex-/userglobal-Praefixe auf
// dieselbe Achse, z. B. 'shared-skills' -> 'skills'). Kategorie-Ids ohne
// registrierten Key (datengetriebene Ids, z. B. Cloud-Custom) fallen auf das
// bisherige Scanner-Label zurueck.
export function categoryLabel(mode: DisplayMode, cat: { id: string; label: string }): string {
  const base = axisLabel(mode, cat)
  const source = categorySource(cat.id)
  return source ? `${source} · ${base}` : base
}

// Achsen-Label ohne Quellen-Praefix: unveraenderte Projektion ueber normalizeCat.
function axisLabel(mode: DisplayMode, cat: { id: string; label: string }): string {
  const key = `config.category.${normalizeCat(cat.id)}`
  return isMessageKey(key) ? msgMode(mode, key as CategoryMessageKey) : cat.label
}

// Quell-Werkzeug einer Userglobal-Kategorie (WP-9). Die Userglobal-Familie
// spiegelt dieselben Achsen aus mehreren Loadern; ohne Praefix standen z. B.
// drei Mal „Agents" untereinander und der Klick traf die falsche Datei.
// NUR Anzeige: Achse, Filter und Dedupe laufen unveraendert ueber normalizeCat.
// Andere Familien (claude/codex/shared) brauchen kein Praefix — dort ist die
// Quelle bereits durch die gewaehlte Familie eindeutig.
const SOURCE_RX = /^userglobal-(claude|codex|agents)-/
const SOURCE_NAME: Record<string, string> = { claude: 'Claude', codex: 'Codex', agents: 'Kimi' }

export function categorySource(id: string): string | null {
  const hit = SOURCE_RX.exec((id ?? '').trim().toLowerCase())
  return hit ? SOURCE_NAME[hit[1]] ?? null : null
}
