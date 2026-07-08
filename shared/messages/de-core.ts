import type { MessageCatalog } from './types'
import { CORE_MESSAGE_KEYS } from './message-keys-core'

type CoreMessageKey = (typeof CORE_MESSAGE_KEYS)[number]

export const deCoreMessages = {
  "settings.language.label": "App-Sprache",
  "settings.language.de": "Deutsch",
  "settings.language.en": "English",
  "settings.tab.tweaks": "Darstellung",
  "settings.tab.updates": "Updates",
  "settings.tab.sources": "Ordner",
  "settings.tab.modules": "Module",
  "settings.reopenOnboarding": "Einrichtung erneut öffnen",
  "onboarding.modelDiscovery.title": "Erkannte Modelle",
  "onboarding.modelDiscovery.empty": "Keine lokalen Modelle gefunden. Wähle den Modellordner auf deiner Festplatte oder starte einen lokalen Modellserver.",
  "onboarding.modelDiscovery.chooseFolder": "Modellordner wählen",
  "integrations.title": "Module",
  "integrations.aria.modules": "Module",
  "integrations.module.core": "Grundfunktionen",
  "integrations.module.userSources": "Eigene Ordner",
  "integrations.module.sharedTrunk": "Gemeinsame Regeln",
  "integrations.module.workspaceRegistry": "Arbeitsbereiche",
  "integrations.module.graphify": "Wissensnetz",
  "integrations.module.obsidian": "Notizen",
  "integrations.module.watcherGovernance": "Wartung & Hinweise",
  "integrations.status.notConfigured": "Nicht eingerichtet",
  "integrations.status.found": "Gefunden",
  "integrations.status.active": "Aktiv",
  "integrations.status.paused": "Pausiert",
  "integrations.status.unavailable": "Nicht verfuegbar",
  "integrations.action.activate": "Aktivieren",
  "integrations.action.pause": "Pausieren",
  "integrations.action.chooseFolder": "Ordner waehlen…",
  "integrations.error.loadFailed": "Integrationen konnten nicht geladen werden.",
  "integrations.error.unavailable": "Integrationen sind nicht verfügbar.",
} as const satisfies Pick<MessageCatalog, CoreMessageKey>
