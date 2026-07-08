import { coreModule } from '../core/module'
import { graphifyModule } from '../graphify/module'
import { obsidianModule } from '../obsidian/module'
import { sharedTrunkModule } from '../shared-trunk/module'
import { userSourcesModule } from '../user-sources/module'
import { watcherGovernanceModule } from '../watcher-governance/module'
import { workspaceRegistryModule } from '../workspace-registry/module'
import type { ModuleUiDefinition } from './module-model'

export const MODULE_DEFINITIONS: ReadonlyArray<ModuleUiDefinition> = [
  coreModule,
  userSourcesModule,
  sharedTrunkModule,
  workspaceRegistryModule,
  graphifyModule,
  obsidianModule,
  watcherGovernanceModule
]
