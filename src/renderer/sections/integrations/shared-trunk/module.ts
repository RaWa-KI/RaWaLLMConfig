import type { ModuleUiDefinition } from '../shared/module-model'
import { msg } from '../../../lib/messages'

export const sharedTrunkModule: ModuleUiDefinition = {
  id: 'shared-trunk',
  label: msg('integrations.module.sharedTrunk'),
  labelKey: 'integrations.module.sharedTrunk',
  core: false,
  defaultEnabled: false,
  probeKind: 'path',
  icon: 'layers',
  informational: false,
  folderAction: true
}
