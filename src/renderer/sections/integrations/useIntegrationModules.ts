import { useCallback, useEffect, useState } from 'react'
import type { IpcResult } from '@shared/contract'
import type { IntegrationId, ResolvedIntegration } from '@shared/contract-integrations'
import type { ModuleCardState } from './shared/module-model'
import { fallbackModuleState, localizedDefinition, mergeResolvedModules } from './shared/module-model'
import { MODULE_DEFINITIONS } from './shared/module-catalog'
import { msg } from '../../lib/messages'
import { useLocale } from '../../state/store-locale'

interface IntegrationsApi {
  list(): Promise<IpcResult<ResolvedIntegration[]>>
  setEnabled(req: { id: IntegrationId; enabled: boolean; root?: string | null }): Promise<IpcResult<ResolvedIntegration[]>>
  setPaused(req: { id: IntegrationId; paused: boolean }): Promise<IpcResult<ResolvedIntegration[]>>
}

function integrationsApi(): IntegrationsApi | null {
  return window.electronAPI?.integrations ?? null
}

function localizedDefinitions() {
  return MODULE_DEFINITIONS.map((definition) => localizedDefinition(definition))
}

export function useIntegrationModules() {
  const { locale } = useLocale()
  const definitions = localizedDefinitions()
  const [resolved, setResolved] = useState<ResolvedIntegration[] | null>(null)
  const [busyId, setBusyId] = useState<IntegrationId | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const bridgeReady = integrationsApi() !== null
  const modules = resolved
    ? mergeResolvedModules(definitions, resolved)
    : definitions.map((definition) => fallbackModuleState(definition))

  const applyResult = useCallback((result: IpcResult<ResolvedIntegration[]>) => {
    if (result.error || !result.data) {
      setMessage(result.error ?? msg('integrations.error.loadFailed'))
      return
    }
    setResolved(result.data)
    setMessage(null)
  }, [])

  const reload = useCallback(async () => {
    const api = integrationsApi()
    if (!api) {
      setMessage(msg('integrations.error.unavailable'))
      return
    }
    applyResult(await api.list())
  }, [applyResult, locale])

  const toggle = useCallback(async (module: ModuleCardState) => {
    const api = integrationsApi()
    if (!api) return setMessage(msg('integrations.error.unavailable'))
    setBusyId(module.id)
    const result = module.pendingRoot !== undefined
      ? await api.setEnabled({ id: module.id, enabled: true, root: module.pendingRoot })
      : module.availability === 'active'
      ? await api.setPaused({ id: module.id, paused: true })
      : module.availability === 'paused'
        ? await api.setPaused({ id: module.id, paused: false })
        : await api.setEnabled({ id: module.id, enabled: true, root: module.root })
    applyResult(result)
    setBusyId(null)
  }, [applyResult])

  useEffect(() => {
    void reload()
  }, [reload])

  return { modules, busyId, message, bridgeReady, toggle }
}
