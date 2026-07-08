import type { MessageCatalog } from './types'
import { CORE_MESSAGE_KEYS } from './message-keys-core'

type CoreMessageKey = (typeof CORE_MESSAGE_KEYS)[number]

export const enCoreMessages = {
  "settings.language.label": "App language",
  "settings.language.de": "German",
  "settings.language.en": "English",
  "settings.tab.tweaks": "Appearance",
  "settings.tab.updates": "Updates",
  "settings.tab.sources": "Folders",
  "settings.tab.modules": "Modules",
  "settings.reopenOnboarding": "Open setup again",
  "onboarding.modelDiscovery.title": "Detected models",
  "onboarding.modelDiscovery.empty": "No local models found. Choose the model folder on your drive or start a local model server.",
  "onboarding.modelDiscovery.chooseFolder": "Choose model folder",
  "integrations.title": "Modules",
  "integrations.aria.modules": "Modules",
  "integrations.module.core": "Core features",
  "integrations.module.userSources": "Own folders",
  "integrations.module.sharedTrunk": "Shared rules",
  "integrations.module.workspaceRegistry": "Workspaces",
  "integrations.module.graphify": "Knowledge graph",
  "integrations.module.obsidian": "Notes",
  "integrations.module.watcherGovernance": "Maintenance & notices",
  "integrations.status.notConfigured": "Not set up",
  "integrations.status.found": "Found",
  "integrations.status.active": "Active",
  "integrations.status.paused": "Paused",
  "integrations.status.unavailable": "Not available",
  "integrations.action.activate": "Activate",
  "integrations.action.pause": "Pause",
  "integrations.action.chooseFolder": "Choose folder...",
  "integrations.error.loadFailed": "Integrations could not be loaded.",
  "integrations.error.unavailable": "Integrations are not available.",
} as const satisfies Pick<MessageCatalog, CoreMessageKey>
