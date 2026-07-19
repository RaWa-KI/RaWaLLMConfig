import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { IPC } from '@shared/channels'
import type { IpcResult } from '@shared/contract'
import {
  type ErrorDiagnosticReport,
  type ErrorReportRequest,
  type SaveErrorReportRequest,
  type SaveErrorReportData,
  sanitizeErrorReportRequest
} from '@shared/contract-diagnostics'

type WindowGetter = () => BrowserWindow | null
const SCREENSHOT_MAX_CHARS = 2_000_000

export function registerDiagnosticsIpc(getWindow: WindowGetter): void {
  ipcMain.handle(IPC.diagnosticsSaveErrorReport, async (event, req: SaveErrorReportRequest) =>
    safeDiagnostics(() => saveReport(req, BrowserWindow.fromWebContents(event.sender) ?? getWindow())))
}

async function safeDiagnostics<T>(fn: () => Promise<IpcResult<T>>): Promise<IpcResult<T>> {
  try {
    return await fn()
  } catch (err) {
    console.error('[diagnostics]', err instanceof Error ? err.message : String(err))
    return { data: null, error: 'Diagnosebericht fehlgeschlagen' }
  }
}

async function collectReport(
  req: ErrorReportRequest | undefined,
  win: BrowserWindow | null
): Promise<IpcResult<ErrorDiagnosticReport>> {
  const clean = sanitizeErrorReportRequest(req)
  const screenshotDataUrl = await captureScreenshot(win)
  return {
    data: {
      kind: 'renderer-error',
      app: { name: app.getName(), version: app.getVersion() },
      runtime: {
        platform: process.platform,
        electron: process.versions.electron ?? '',
        chrome: process.versions.chrome ?? '',
        node: process.versions.node ?? ''
      },
      timestamp: new Date().toISOString(),
      error: {
        message: String(clean.message),
        source: String(clean.source),
        componentStack: clean.componentStack ? String(clean.componentStack) : null
      },
      screenshotDataUrl
    },
    error: null
  }
}

async function captureScreenshot(win: BrowserWindow | null): Promise<string | null> {
  if (!win || win.isDestroyed()) return null
  try {
    const image = await win.webContents.capturePage()
    if (image.isEmpty()) return null
    const dataUrl = image.toDataURL()
    return dataUrl.length <= SCREENSHOT_MAX_CHARS ? dataUrl : null
  } catch {
    return null
  }
}

async function saveReport(
  req: SaveErrorReportRequest | undefined,
  win: BrowserWindow | null
): Promise<IpcResult<SaveErrorReportData>> {
  const report = (await collectReport(req?.error, win)).data
  if (!report) return { data: null, error: 'Diagnosebericht konnte nicht erstellt werden' }
  const options = {
    title: 'Anonymen Fehlerbericht speichern',
    defaultPath: join(app.getPath('documents'), defaultReportName()),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  const chosen = win && !win.isDestroyed()
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (chosen.canceled || !chosen.filePath) return { data: { canceled: true, fileName: null }, error: null }
  const filePath = uniquePath(chosen.filePath)
  writeFileSync(filePath, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' })
  return { data: { canceled: false, fileName: basename(filePath) }, error: null }
}

function defaultReportName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `rawallmconfig-fehlerbericht-${stamp}.json`
}

function uniquePath(filePath: string): string {
  if (!existsSync(filePath)) return filePath
  const dir = dirname(filePath)
  const ext = extname(filePath)
  const base = basename(filePath, ext)
  for (let i = 1; i < 100; i += 1) {
    const candidate = join(dir, `${base}-${i}${ext}`)
    if (!existsSync(candidate)) return candidate
  }
  return join(dir, `${base}-${Date.now()}${ext}`)
}
