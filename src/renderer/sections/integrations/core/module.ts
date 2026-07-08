import type { ModuleUiDefinition } from '../shared/module-model'
import { msg } from '../../../lib/messages'

export const coreModule: ModuleUiDefinition = {
  id: 'core',
  label: msg('integrations.module.core'),
  labelKey: 'integrations.module.core',
  core: true,
  defaultEnabled: true,
  probeKind: 'none',
  icon: 'gear',
  informational: true,
  folderAction: false
}
