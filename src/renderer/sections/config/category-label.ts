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
  const key = `config.category.${normalizeCat(cat.id)}`
  return isMessageKey(key) ? msgMode(mode, key as CategoryMessageKey) : cat.label
}
