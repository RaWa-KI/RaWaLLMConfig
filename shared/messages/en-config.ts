import type { MessageCatalog } from './types'
import { CONFIG_MESSAGE_KEYS } from './message-keys-config'

type ConfigMessageKey = (typeof CONFIG_MESSAGE_KEYS)[number]

// English mirror of de-config.ts — same projection contract (base = technical
// label, `.simple` = everyday name, `.expert` explicit only for the duplicates tab).
export const enConfigMessages = {
  "config.mode.duplicates": "Duplicates",
  "config.mode.duplicates.simple": "Duplicate entries",
  "config.mode.duplicates.expert": "Duplicates",
  "config.category.agents": "Agents",
  "config.category.agents.simple": "Assistants",
  "config.category.hooks": "Hooks",
  "config.category.hooks.simple": "Automatic checks",
  "config.category.instructions": "Instructions",
  "config.category.instructions.simple": "Guidance",
  "config.category.rules": "Rules",
  "config.category.rules.simple": "Rules",
  "config.category.settings": "Settings",
  "config.category.settings.simple": "Settings",
  "config.category.skills": "Skills",
  "config.category.skills.simple": "Capabilities",
  "config.category.teams": "Teams",
  "config.category.teams.simple": "Teams",
  "config.category.plugins": "Plugins",
  "config.category.plugins.simple": "Extensions",
  "config.category.tools": "Tools",
  "config.category.tools.simple": "Tools",
  "config.category.mcp": "MCP integrations",
  "config.category.mcp.simple": "Connections",
  "config.category.gguf-models": "GGUF models",
  "config.category.gguf-models.simple": "AI models",
  "config.category.llm-endpoints": "Inference endpoints",
  "config.category.llm-endpoints.simple": "Model servers",
} as const satisfies Pick<MessageCatalog, ConfigMessageKey>
