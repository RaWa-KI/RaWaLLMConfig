import type { MessageCatalog } from './types'
import { CONFIG_MESSAGE_KEYS } from './message-keys-config'

type ConfigMessageKey = (typeof CONFIG_MESSAGE_KEYS)[number]

// Config-Form-Projektion (Teil E, Owner-Entscheid D1–D3, 2026-07-18): Basis-Key =
// bisheriges technisches Label (zugleich Experten-Fallback), `.simple` = Alltagsname,
// `.expert` nur wo die Projektion explizit beidseitig gefuehrt wird (Duplikate-Tab).
export const deConfigMessages = {
  "config.mode.duplicates": "Duplikate",
  "config.mode.duplicates.simple": "Doppelte Einträge",
  "config.mode.duplicates.expert": "Duplikate",
  "config.category.agents": "Agents",
  "config.category.agents.simple": "Assistenten",
  "config.category.hooks": "Hooks",
  "config.category.hooks.simple": "Automatische Prüfungen",
  "config.category.instructions": "Instructions",
  "config.category.instructions.simple": "Anweisungen",
  "config.category.rules": "Rules",
  "config.category.rules.simple": "Regeln",
  "config.category.settings": "Settings",
  "config.category.settings.simple": "Einstellungen",
  "config.category.skills": "Skills",
  "config.category.skills.simple": "Fähigkeiten",
  "config.category.teams": "Teams",
  "config.category.teams.simple": "Teams",
  "config.category.plugins": "Plugins",
  "config.category.plugins.simple": "Erweiterungen",
  "config.category.tools": "Tools",
  "config.category.tools.simple": "Werkzeuge",
  "config.category.mcp": "MCP-Integrationen",
  "config.category.mcp.simple": "Verbindungen",
  "config.category.gguf-models": "GGUF-Modelle",
  "config.category.gguf-models.simple": "KI-Modelle",
  "config.category.llm-endpoints": "Inferenz-Endpoints",
  "config.category.llm-endpoints.simple": "Modellserver",
} as const satisfies Pick<MessageCatalog, ConfigMessageKey>
