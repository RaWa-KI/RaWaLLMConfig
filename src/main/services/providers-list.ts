// providers-list.ts — Provider-Auswahl-Liste fuer die UI (WP-C2). Wird IMMER aus
// providerRegistry() abgeleitet, NIE als statische Liste gepflegt (R-C4): so
// erscheinen additive Provider (Cloud aus Teil D, nutzerdefinierte Manifeste)
// automatisch in der Auswahl, ohne UI-Codeaenderung.
import { providerRegistry } from '../scan/manifests'
import type { ProviderChoice } from '@shared/contract-sources'

/**
 * Mappt jedes Manifest der providerRegistry() auf einen schlanken Auswahl-Eintrag
 * ({ id, label }). Fehlt einem Manifest das label, faellt das Label auf die id
 * zurueck — so bleibt jeder Eintrag mit nicht-leerem Anzeigetext sichtbar.
 */
export function listProviderChoices(): ProviderChoice[] {
  return providerRegistry().map((m) => ({ id: m.id, label: m.label || m.id }))
}
