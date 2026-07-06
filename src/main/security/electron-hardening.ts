type EnvLike = Record<string, string | undefined>

export type TrustedRendererOptions = {
  devUrl?: string | null
}

type PreventableEvent = {
  preventDefault(): void
}

type WebContentsLike = {
  getURL(): string
  on(channel: string, listener: (...args: any[]) => void): void
  setWindowOpenHandler(listener: (details: { url: string }) => { action: 'deny' }): void
}

type BrowserWindowLike = {
  webContents: WebContentsLike
  isDestroyed?(): boolean
}

type IpcMainLike = {
  handle(channel: string, listener: (event: any, ...args: any[]) => unknown): unknown
}

type IpcEventLike = {
  sender: WebContentsLike
  senderFrame?: { url: string } | null
}

const guardedIpcMains = new WeakSet<object>()

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isSameOrigin(value: URL, expected: URL): boolean {
  return value.protocol === expected.protocol && value.host === expected.host
}

export function isTrustedRendererUrl(value: string, options: TrustedRendererOptions = {}): boolean {
  const parsed = parseUrl(value)
  if (!parsed) return false
  if (parsed.protocol === 'app:' && parsed.host === 'host') return true
  const devUrl = options.devUrl ? parseUrl(options.devUrl) : null
  return Boolean(devUrl && isSameOrigin(parsed, devUrl))
}

export function shouldOpenExternalUrl(value: string): boolean {
  const parsed = parseUrl(value)
  return Boolean(parsed && parsed.protocol === 'https:')
}

export function isDevtoolsEnabled(env: EnvLike = process.env): boolean {
  return env.RAWALLM_DEVTOOLS === '1' || Boolean(env.ELECTRON_RENDERER_URL)
}

function eventSenderUrl(event: IpcEventLike): string {
  return event.senderFrame?.url || event.sender.getURL()
}

export function assertTrustedIpcSender(
  event: IpcEventLike,
  getMainWindow: () => BrowserWindowLike | null,
  options: TrustedRendererOptions = {}
): void {
  const win = getMainWindow()
  const isMainSender = Boolean(win && !win.isDestroyed?.() && event.sender === win.webContents)
  if (!isMainSender || !isTrustedRendererUrl(eventSenderUrl(event), options)) {
    throw new Error('Untrusted IPC sender')
  }
}

export function installTrustedIpcGuard(
  ipcMain: IpcMainLike,
  getMainWindow: () => BrowserWindowLike | null,
  options: TrustedRendererOptions = {}
): void {
  if (guardedIpcMains.has(ipcMain)) return
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) => originalHandle(channel, (event, ...args) => {
    assertTrustedIpcSender(event, getMainWindow, options)
    return listener(event, ...args)
  })
  guardedIpcMains.add(ipcMain)
}

export function hardenWindowNavigation(
  win: BrowserWindowLike,
  options: TrustedRendererOptions,
  openExternal: (url: string) => Promise<unknown>
): void {
  win.webContents.on('will-navigate', (event: PreventableEvent, url: string) => {
    if (!isTrustedRendererUrl(url, options)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternalUrl(url)) void openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-attach-webview', (event: PreventableEvent) => event.preventDefault())
}
