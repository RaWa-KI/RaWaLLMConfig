// grok.manifest.ts — datengetriebenes Manifest fuer ~/.grok (Grok-Loader).
// HR16-Paritaet: Claude, Codex, Kimi und Grok sind gleichwertige native Loader;
// bisher kannte die App den Grok-Loader gar nicht — seine Regeln und Skills
// blieben unsichtbar (F10). Aufbau strikt nach kimi.manifest: bespoke Kategorien
// als CustomCategory (instructions/settings/credentials, siehe grok-cats.ts),
// Ordner-Kategorien deklarativ als CategorySpec.
//
// ROOT-BESONDERHEIT (wie kimi.manifest): ConfigRoots fuehrt keinen `grokHome`-
// Schluessel — der Vier-Wurzel-Vertrag bleibt unberuehrt. `roots` liefert ueber
// einen Getter bei JEDEM Zugriff einen `fixedRoot` aus grokHome(); dadurch
// bleibt die RAWALLM_SANDBOX_ROOT-Verlegung erhalten. Kein absoluter Pfad im
// Code (public-safe, HR27).
import type { CategorySpec, ProviderManifest, ProviderRoot } from '@shared/contract-provider'
import { grokHome, grokInstructions, grokSettings, grokCredentials } from './grok-cats'

// Deklarative dir-Kategorie nach kimi.manifest-Vorbild (scan:'dir').
function dirSpec(sub: string, label: string, icon: string, desc: string): CategorySpec {
  return {
    id: `grok-${sub}`,
    idPrefix: `grok-${sub}`,
    label,
    icon,
    blurb: `grokDir/${sub}/*`,
    subdir: sub,
    scan: 'dir',
    parser: 'frontmatter',
    withContent: true,
    desc,
  }
}

export const grokManifest: ProviderManifest = {
  id: 'grok',
  label: 'Grok',
  // Getter statt fixem Array: pro Zugriff sandbox-aware aufgeloest (s. Kopf).
  get roots(): ProviderRoot[] {
    return [{ fixedRoot: grokHome() }]
  },
  capabilities: ['secret-guarded'],
  categories: [
    { custom: (base: string) => grokInstructions(base) },
    { custom: (base: string) => grokSettings(base) },
    { custom: (base: string) => grokCredentials(base) },
    dirSpec('rules', 'Rules', 'rule', 'Grok-Regel'),
    dirSpec('skills', 'Skills', 'skill', 'Grok-Skill'),
    dirSpec('hooks', 'Hooks', 'hook', 'Grok-Hook-Skript'),
  ],
}
