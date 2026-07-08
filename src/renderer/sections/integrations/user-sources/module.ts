import type { ModuleUiDefinition } from '../shared/module-model'
import { msg } from '../../../lib/messages'

export const userSourcesModule: ModuleUiDefinition = {
  id: 'user-sources',
  label: msg('integrations.module.userSources'),
  labelKey: 'integrations.module.userSources',
  core: false,
  defaultEnabled: true,
  probeKind: 'none',
  icon: 'folder',
  informational: true,
  folderAction: true
}
