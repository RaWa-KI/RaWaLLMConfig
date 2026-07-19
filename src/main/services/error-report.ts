import { app, BrowserWindow } from 'electron'
import os from 'node:os'
import type {
  ErrorReportCollectInput,
  ErrorReportCollectResult,
  ErrorReportSubmitResult,
  ErrorReportSystemInfo
} from '@shared/contract-error-report'
import { sanitizeSubmitInput } from '@shared/contract-error-report'

// Online-Fehlerbericht (D055): sammelt Systeminfo + Screenshot und sendet nach
// aktivem Nutzer-Consent an den zentralen Endpunkt. Keine PII, keine Pfade,
// keine device-ID — der Server nutzt seine eigene Rate-Limit-Basis.
const API_URL = 'https://rawalite.de/api/error-report.php'
const MAX_REPORTS_PER_DAY = 5
const APP_NAME = 'RaWaLLMConfig'

// Rate-Limit: Tages-Zaehler im Memory (reicht fuer eine App-Session).
let dailyReportCount = 0
let dailyReportDate = new Date().toISOString().slice(0, 10)

// Zuletzt gesammelter Screenshot: der Renderer bekommt ihn nur als Vorschau,
// das Senden uebernimmt der Main (Opt-out wirksam, kein Rueckweg uebers IPC).
let pendingScreenshot: string | null = null

function checkRateLimit(): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== dailyReportDate) {
    dailyReportDate = today
    dailyReportCount = 0
  }
  return dailyReportCount < MAX_REPORTS_PER_DAY
}

export function getRateLimitStatus(): { remaining: number; limit: number } {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== dailyReportDate) return { remaining: MAX_REPORTS_PER_DAY, limit: MAX_REPORTS_PER_DAY }
  return { remaining: Math.max(0, MAX_REPORTS_PER_DAY - dailyReportCount), limit: MAX_REPORTS_PER_DAY }
}

export function collectSystemInfo(): ErrorReportSystemInfo {
  return {
    appVersion: app.getVersion(),
    // Kein DB-/Datei-Schema in dieser App — bewusst -1 wie im Referenz-Template.
    schemaVersion: -1,
    electronVersion: process.versions.electron ?? 'unknown',
    chromeVersion: process.versions.chrome ?? 'unknown',
    nodeVersion: process.versions.node ?? 'unknown',
    platform: os.platform(),
    arch: os.arch(),
    osRelease: os.release(),
    freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
    totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024)
  }
}

// Screenshot (max 800px Breite, Base64-PNG). Faellt bei Fehler still auf null
// zurueck — der Bericht darf an einem Capture-Problem nie scheitern.
async function captureScreenshot(win: BrowserWindow | null): Promise<string | null> {
  if (!win || win.isDestroyed()) return null
  try {
    const image = await win.webContents.capturePage()
    if (image.isEmpty()) return null
    return image.resize({ width: 800 }).toPNG().toString('base64')
  } catch {
    return null
  }
}

export async function handleErrorReportCollect(
  _input: ErrorReportCollectInput,
  win: BrowserWindow | null
): Promise<ErrorReportCollectResult> {
  pendingScreenshot = await captureScreenshot(win)
  return {
    screenshot: pendingScreenshot,
    systemInfo: collectSystemInfo(),
    rateLimit: getRateLimitStatus()
  }
}

export async function handleErrorReportSubmit(input: unknown): Promise<ErrorReportSubmitResult> {
  const clean = sanitizeSubmitInput(input)
  if (!checkRateLimit()) {
    return { success: false, error: 'Rate-Limit erreicht (max. 5 Berichte pro Tag)' }
  }
  const systemInfo = collectSystemInfo()
  const screenshot = clean.includeScreenshot ? pendingScreenshot : null
  try {
    const payload = {
      appName: APP_NAME,
      appVersion: systemInfo.appVersion,
      schemaVersion: systemInfo.schemaVersion,
      electronVersion: systemInfo.electronVersion,
      chromeVersion: systemInfo.chromeVersion,
      nodeVersion: systemInfo.nodeVersion,
      platform: systemInfo.platform,
      arch: systemInfo.arch,
      osRelease: systemInfo.osRelease,
      freeMemoryMB: systemInfo.freeMemoryMB,
      totalMemoryMB: systemInfo.totalMemoryMB,
      errorMessage: clean.errorMessage,
      errorStack: clean.errorStack || undefined,
      errorSource: clean.errorSource,
      userComment: clean.userComment || undefined,
      screenshot: screenshot ?? undefined,
      logs: clean.includeLogs && clean.logs ? clean.logs : undefined
    }
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${APP_NAME}-ErrorReport/${systemInfo.appVersion}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return { success: false, error: `Server-Fehler (${response.status}): ${text.slice(0, 200)}` }
    }
    const result = await response.json() as { reportId?: string }
    dailyReportCount += 1
    pendingScreenshot = null
    console.log(`[error-report] Bericht gesendet: ${result.reportId || 'OK'}`)
    return { success: true, reportId: result.reportId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[error-report] Senden fehlgeschlagen:', message)
    return { success: false, error: `Verbindungsfehler: ${message.slice(0, 200)}` }
  }
}
