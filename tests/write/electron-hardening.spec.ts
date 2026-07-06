import { test, expect } from '@playwright/test'
import {
  assertTrustedIpcSender,
  hardenWindowNavigation,
  installTrustedIpcGuard,
  isDevtoolsEnabled,
  isTrustedRendererUrl,
  shouldOpenExternalUrl
} from '../../src/main/security/electron-hardening'

function makePreventable(): { prevented: boolean; preventDefault(): void } {
  return {
    prevented: false,
    preventDefault() {
      this.prevented = true
    }
  }
}

test('Renderer-URLs sind auf app://host oder Dev-Origin begrenzt', () => {
  const opts = { devUrl: 'http://127.0.0.1:5179/' }
  expect(isTrustedRendererUrl('app://host/index.html')).toBe(true)
  expect(isTrustedRendererUrl('http://127.0.0.1:5179/src/main.tsx', opts)).toBe(true)
  expect(isTrustedRendererUrl('file:///C:/tmp/index.html', opts)).toBe(false)
  expect(isTrustedRendererUrl('app://evil/index.html', opts)).toBe(false)
  expect(isTrustedRendererUrl('https://example.com/', opts)).toBe(false)
})

test('IPC-Sender muss MainWindow und vertrauenswuerdige URL sein', () => {
  const webContents = { getURL: () => 'app://host/index.html' }
  const win = { webContents }
  expect(() => assertTrustedIpcSender({ sender: webContents }, () => win)).not.toThrow()
  expect(() => assertTrustedIpcSender({ sender: { getURL: () => 'app://host/index.html' } }, () => win))
    .toThrow('Untrusted IPC sender')
  expect(() => assertTrustedIpcSender({ sender: webContents, senderFrame: { url: 'file:///tmp/x.html' } }, () => win))
    .toThrow('Untrusted IPC sender')
  expect(() => assertTrustedIpcSender({ sender: webContents }, () => null)).toThrow('Untrusted IPC sender')
})

test('ipcMain.handle wird zentral mit Sender-Pruefung gewrappt', () => {
  const webContents = { getURL: () => 'app://host/index.html' }
  let registered: ((event: unknown, value: number) => unknown) | null = null
  const ipcMain = { handle: (_channel: string, listener: typeof registered) => { registered = listener } }
  installTrustedIpcGuard(ipcMain, () => ({ webContents }))
  ipcMain.handle('demo', (_event, value: number) => value + 1)
  expect(registered?.({ sender: webContents }, 1)).toBe(2)
  expect(() => registered?.({ sender: { getURL: () => 'file:///x.html' } }, 1)).toThrow('Untrusted IPC sender')
})

test('Navigation default-deny, externe Fenster nur validiertes https', async () => {
  const listeners = new Map<string, (...args: any[]) => void>()
  const opened: string[] = []
  const webContents = {
    getURL: () => 'app://host/index.html',
    on: (name: string, listener: (...args: any[]) => void) => listeners.set(name, listener),
    setWindowOpenHandler: (listener: (details: { url: string }) => { action: 'deny' }) =>
      listeners.set('window-open', listener)
  }
  hardenWindowNavigation({ webContents }, {}, async (url) => { opened.push(url) })

  const allowedNav = makePreventable()
  listeners.get('will-navigate')?.(allowedNav, 'app://host/index.html')
  expect(allowedNav.prevented).toBe(false)

  const blockedNav = makePreventable()
  listeners.get('will-navigate')?.(blockedNav, 'file:///tmp/index.html')
  expect(blockedNav.prevented).toBe(true)

  expect(listeners.get('window-open')?.({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
  expect(listeners.get('window-open')?.({ url: 'http://example.com/' })).toEqual({ action: 'deny' })
  await Promise.resolve()
  expect(opened).toEqual(['https://example.com/'])

  const webview = makePreventable()
  listeners.get('will-attach-webview')?.(webview)
  expect(webview.prevented).toBe(true)
})

test('DevTools sind nur Dev- oder Env-gated aktiv', () => {
  expect(isDevtoolsEnabled({})).toBe(false)
  expect(isDevtoolsEnabled({ ELECTRON_RENDERER_URL: 'http://127.0.0.1:5179' })).toBe(true)
  expect(isDevtoolsEnabled({ RAWALLM_DEVTOOLS: '1' })).toBe(true)
  expect(shouldOpenExternalUrl('https://example.com/')).toBe(true)
  expect(shouldOpenExternalUrl('http://example.com/')).toBe(false)
})
