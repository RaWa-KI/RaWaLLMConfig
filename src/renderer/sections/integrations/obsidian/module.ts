import type { ModuleUiDefinition } from '../shared/module-model'
import { msg } from '../../../lib/messages'

export const obsidianModule: ModuleUiDefinition = {
  id: 'obsidian',
  label: msg('integrations.module.obsidian'),
  labelKey: 'integrations.module.obsidian',
  core: false,
  defaultEnabled: false,
  probeKind: 'vault',
  icon: 'note',
  informational: false,
  folderAction: true
}
