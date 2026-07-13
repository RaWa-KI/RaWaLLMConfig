import type { UpdateStateData } from '@shared/contract-updates'
import { msg } from '../lib/messages'

type ElectronApi = NonNullable<typeof window.electronAPI>

export type UpdateResult<T> = { data: T | null; error: string | null }
export type UpdateRunFn<T> = () => Promise<UpdateResult<T>>
export type ToastFn = (msg: string, icon: string) => void
export type SetBusyFn = (value: boolean) => void

export function hasUpdateBridge(method: keyof ElectronApi): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.electronAPI &&
    typeof window.electronAPI[method] === 'function'
  )
}

export async function runUpdateAction<T>(
  fn: UpdateRunFn<T>,
  setBusy: SetBusyFn,
  showToast: ToastFn,
  okMsg: string
): Promise<UpdateResult<T>> {
  setBusy(true)
  let res: UpdateResult<T>
  try {
    res = await fn()
  } catch {
    res = { data: null, error: msg('update.toast.bridgeError') }
  } finally {
    setBusy(false)
  }
  showUpdateToast(res, showToast, okMsg)
  return res
}

export function updateErrorMessage(error: string | null): string | null {
  if (error === 'appimage-env-missing') return msg('update.error.appimageEnvMissing')
  return error
}

function showUpdateToast<T>(
  res: UpdateResult<T>,
  showToast: ToastFn,
  okMsg: string
): void {
  if (res.error || res.data === null) {
    showToast(updateErrorMessage(res.error) ?? msg('update.toast.actionFailed'), 'warn')
    return
  }
  showToast(okMsg, 'check')
}

export async function readUpdateState(): Promise<UpdateResult<UpdateStateData>> {
  return window.electronAPI!.updatesGetState()
}
