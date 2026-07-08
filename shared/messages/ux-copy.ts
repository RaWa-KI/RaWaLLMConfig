import type { IntegrationId } from '../contract-integrations'
import { getLocale, type AppLocale } from './index'

type LocalizedText = Record<AppLocale, string>

interface ModuleCopy {
  simple: LocalizedText
  expert: LocalizedText
}

const MODULE_COPY: Record<IntegrationId, ModuleCopy> = {
  core: {
    simple: {
      de: 'Grundlage der App: Laden, Prüfen und sicheres Speichern bleiben aktiv.',
      en: 'The app basics: loading, checking, and safe saving stay active.'
    },
    expert: {
      de: 'Core-Modul ohne Schalter; stellt Store, IPC-Basis und Backup-first-Flüsse bereit.',
      en: 'Core module without a toggle; provides store, IPC base, and backup-first flows.'
    }
  },
  'user-sources': {
    simple: {
      de: 'Eigene Ordner, die die App zusätzlich durchsuchen und erklären soll.',
      en: 'Your own folders that the app should also scan and explain.'
    },
    expert: {
      de: 'Zusätzliche Scan-Roots aus der Quellenliste; wirkt auf Config-, Struktur- und Vergleichsflächen.',
      en: 'Additional scan roots from the source list; affects config, structure, and comparison views.'
    }
  },
  'shared-trunk': {
    simple: {
      de: 'Gemeinsame Regeln für mehrere Arbeitsbereiche; wichtig, wenn Projekte zusammenarbeiten.',
      en: 'Shared rules for several workspaces; important when projects work together.'
    },
    expert: {
      de: 'Erwartet den Shared-Trunk unter .shared/.claude mit rules, skills, agents, hooks und coordination.',
      en: 'Expects the shared trunk under .shared/.claude with rules, skills, agents, hooks, and coordination.'
    }
  },
  'workspace-registry': {
    simple: {
      de: 'Liste der bekannten Arbeitsbereiche, damit Pfade und Zustände richtig zugeordnet werden.',
      en: 'List of known workspaces so paths and states can be assigned correctly.'
    },
    expert: {
      de: 'Registry-/Profil-Daten für Workspace-Namen, Pfade, Ports und Statussignale.',
      en: 'Registry/profile data for workspace names, paths, ports, and status signals.'
    }
  },
  graphify: {
    simple: {
      de: 'Wissensnetz für Zusammenhänge zwischen Dateien, Regeln und Aufgaben.',
      en: 'Knowledge graph for relationships between files, rules, and tasks.'
    },
    expert: {
      de: 'Graphify-/KG-Artefakte für semantische Suche, Impact-Sichten und Evidence-Packs.',
      en: 'Graphify/KG artifacts for semantic search, impact views, and evidence packs.'
    }
  },
  obsidian: {
    simple: {
      de: 'Notizen und Wissensseiten, die beim Einordnen von Regeln helfen.',
      en: 'Notes and knowledge pages that help explain rules.'
    },
    expert: {
      de: 'Obsidian-Vaults mit Wikilinks, Indizes und referenzierbaren Projektseiten.',
      en: 'Obsidian vaults with wikilinks, indexes, and referenceable project pages.'
    }
  },
  'watcher-governance': {
    simple: {
      de: 'Wartungs- und Hinweisberichte, die zeigen, was Aufmerksamkeit braucht.',
      en: 'Maintenance and notice reports that show what needs attention.'
    },
    expert: {
      de: 'Watcher-Reports, Changelog-Gates und Toolchain-Hinweise aus den Governance-Quellen.',
      en: 'Watcher reports, changelog gates, and toolchain notices from governance sources.'
    }
  }
}

const PREFS_STORE_HINT = {
  de: {
    title: 'Die App nutzt gerade lokale Dateien',
    body: 'Die Datenbank ist im Moment nicht erreichbar. Das ist kein Datenverlust: Einstellungen werden weiter lokal gelesen und gespeichert.',
    action: 'Du kannst weiterarbeiten. Wenn du die Datenbank nutzen willst, prüfe später die lokale MariaDB/Plattform-Anbindung.'
  },
  en: {
    title: 'The app is using local files right now',
    body: 'The database is not reachable at the moment. This is not data loss: settings are still read and saved locally.',
    action: 'You can keep working. If you want the database path, check the local MariaDB/platform connection later.'
  }
} as const

const LANGUAGE_PACK_HINT: Record<AppLocale, string> = {
  de: 'Deutsch und Englisch sind fest eingebaut. Eigene Sprachpakete können in dieser Version noch nicht importiert werden.',
  en: 'German and English are built in. Custom language packs cannot be imported in this version yet.'
}

const WATCHER_HELP: Record<AppLocale, string> = {
  de: 'Der Toolchain-Watcher ist die Wartungsprüfung für bekannte Werkzeuge wie Codex oder Claude Code. Er liest vorhandene Quellen automatisch, prüft lokale Versionen und zeigt Hinweise oder Updates. Neue Werkzeuge richtet er nicht selbst ein; zusätzliche Quellen fügst du in Einrichtung oder Module hinzu.',
  en: 'The toolchain watcher is the maintenance check for known tools such as Codex or Claude Code. It reads existing sources automatically, checks local versions, and shows notices or updates. It does not set up new tools by itself; add extra sources in setup or modules.'
}

const SETTINGS_EXPERT_LIST: Record<AppLocale, string[]> = {
  de: [
    'Technische Details erscheinen in Überblick, Diagnose, Modulen und Editoren.',
    'Sprachzustand und lokale Speicherquelle werden als eigene Hinweise gezeigt.',
    'Schreiblogik bleibt gleich: Vorschau, Sicherung und Bestätigung.'
  ],
  en: [
    'Technical details appear in overview, diagnosis, modules, and editors.',
    'Language state and local storage source are shown as separate hints.',
    'Write behavior stays the same: preview, backup, and confirmation.'
  ]
}

export function moduleDescription(id: IntegrationId, mode: 'simple' | 'expert', locale = getLocale()): string {
  return MODULE_COPY[id][mode][locale]
}

export function prefsStoreHint(locale = getLocale()) {
  return PREFS_STORE_HINT[locale]
}

export function languagePackHint(locale = getLocale()): string {
  return LANGUAGE_PACK_HINT[locale]
}

export function watcherHelp(locale = getLocale()): string {
  return WATCHER_HELP[locale]
}

export function settingsExpertList(locale = getLocale()): string[] {
  return SETTINGS_EXPERT_LIST[locale]
}
