import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UpdateProgressPayload, UpdateStateData } from '@shared/contract-updates'
import { msg } from '../lib/messages'
import { useStore } from './store'
import type { UpdateManagerValue } from './store-update-manager'
import {
  hasUpdateBridge,
  readUpdateState,
  runUpdateAction,
  type SetBusyFn,
  type ToastFn
} from './update-manager-bridge'

type RefreshFn = () => Promise<void>

export function useUpdateManagerState(): UpdateManagerValue {
  const { actions } = useStore()
  const [state, setState] = useState<UpdateStateData | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<UpdateProgressPayload | null>(null)
  useUpdateProgress(setProgress)
  const refresh = useUpdateRefresh(setBusy, setState)
  useEffect(() => { void refresh() }, [refresh])
  const check = useUpdateCheck(setBusy, actions.showToast, refresh)
  const download = useUpdateDownload(state?.latestVersion, setProgress, setBusy, actions.showToast, refresh)
  const install = useUpdateInstall(setBusy, actions.showToast)
  return useMemo(() => ({
    state,
    busy,
    progress,
    check,
    download,
    install,
    refresh
  }), [busy, check, download, install, progress, refresh, state])
}

function useUpdateProgress(setProgress: (payload: UpdateProgressPayload) => void): void {
  useEffect(() => {
    if (!hasUpdateBridge('onUpdatesProgress')) return
    const off = window.electronAPI!.onUpdatesProgress((p) => {
      setProgress(p)
    })
    return () => {
      off()
    }
  }, [setProgress])
}

function useUpdateRefresh(
  setBusy: SetBusyFn,
  setState: (value: UpdateStateData) => void
): RefreshFn {
  return useCallback(async (): Promise<void> => {
    if (!hasUpdateBridge('updatesGetState')) return
    setBusy(true)
    try {
      const res = await readUpdateState()
      if (res.data) setState(res.data)
    } catch {
      // Fehler still behandeln — kein Toast beim Hintergrund-Refresh
    } finally {
      setBusy(false)
    }
  }, [setBusy, setState])
}

function useUpdateCheck(
  setBusy: SetBusyFn,
  showToast: ToastFn,
  refresh: RefreshFn
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    if (!hasUpdateBridge('updatesCheck')) {
      showToast(msg('update.toast.bridgeUnavailable'), 'warn')
      return
    }
    const res = await runUpdateAction(
      () => window.electronAPI!.updatesCheck(),
      setBusy,
      showToast,
      msg('update.toast.checkComplete')
    )
    if (res.data !== null) await refresh()
  }, [refresh, setBusy, showToast])
}

function useUpdateDownload(
  version: string | null | undefined,
  setProgress: (payload: UpdateProgressPayload | null) => void,
  setBusy: SetBusyFn,
  showToast: ToastFn,
  refresh: RefreshFn
): () => Promise<boolean> {
  return useCallback(async (): Promise<boolean> => {
    if (!hasUpdateBridge('updatesDownload')) {
      showToast(msg('update.toast.bridgeUnavailable'), 'warn')
      return false
    }
    if (!version) {
      showToast(msg('update.toast.noUpdateAvailable'), 'warn')
      return false
    }
    setProgress(null)
    const res = await runUpdateAction(
      () => window.electronAPI!.updatesDownload({ version }),
      setBusy,
      showToast,
      msg('update.toast.downloaded')
    )
    await refresh()
    return res.data !== null && !res.error
  }, [refresh, setBusy, setProgress, showToast, version])
}

function useUpdateInstall(
  setBusy: SetBusyFn,
  showToast: ToastFn
): () => Promise<boolean> {
  return useCallback(async (): Promise<boolean> => {
    if (!hasUpdateBridge('updatesInstall')) {
      showToast(msg('update.toast.bridgeUnavailable'), 'warn')
      return false
    }
    const res = await runUpdateAction(
      () => window.electronAPI!.updatesInstall({ silent: true }),
      setBusy,
      showToast,
      msg('update.toast.installStarted')
    )
    return res.data !== null && !res.error
  }, [setBusy, showToast])
}
