/**
 * devtools.ts — lokaler DevTools-Zugang.
 *
 * Aktiv nur im Dev-Server-Modus oder mit RAWALLM_DEVTOOLS=1. Kein Remote-
 * Debugging-Port, nur lokale DevTools.
 */
import type { BrowserWindow } from 'electron'
import { isDevtoolsEnabled } from './security/electron-hardening'

/** F12 / Ctrl+Shift+I → DevTools toggeln (fensterspezifischer Input, kein globaler Shortcut). */
function bindToggleShortcut(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (_evt, input) => {
    if (input.type !== 'keyDown') return
    const isF12 = input.key === 'F12'
    const isCtrlShiftI =
      (input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'
    if (isF12 || isCtrlShiftI) win.webContents.toggleDevTools()
  })
}

/** Bei Ladefehler DevTools automatisch oeffnen (ERR_ABORTED -3 ignorieren). */
function openOnLoadFailure(win: BrowserWindow): void {
  win.webContents.on('did-fail-load', (_evt, errCode) => {
    if (errCode === -3) return
    if (!win.isDestroyed()) win.webContents.openDevTools({ mode: 'detach' })
  })
}

/** DevTools-Zugang fuer das Fenster aktivieren. In createWindow() aufrufen. */
export function enableDevtools(win: BrowserWindow): void {
  if (!isDevtoolsEnabled()) return
  bindToggleShortcut(win)
  openOnLoadFailure(win)
  if (process.env.RAWALLM_DEVTOOLS === '1') {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.openDevTools({ mode: 'detach' })
    })
  }
}
