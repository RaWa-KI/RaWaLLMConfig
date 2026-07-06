import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { registerWrite } from './register-write'
import { registerUpdatesIpc } from './ipc-updates'
import { endPool } from './services/mariadb-pool'
import { registerAppScheme, handleAppProtocol } from './app-protocol'
import { enableDevtools } from './devtools'
import { hardenWindowNavigation, installTrustedIpcGuard } from './security/electron-hardening'
import { startConfigWatcher, stopConfigWatcher } from './services/config-watcher'

// A8-6, Stufe 2 (Main-Prozess): letzte Auffangschicht. Ein unbehandelter Fehler/
// Reject im Main-Prozess wuerde die App sonst hart beenden. Nur die Klartext-
// message loggen (secret-frei, kein Objekt-Dump) und die App am Leben halten.
process.on('uncaughtException', (e) => console.error('[main] uncaught', e instanceof Error ? e.message : e))
process.on('unhandledRejection', (r) => console.error('[main] unhandled', r instanceof Error ? r.message : r))

// CORS-Fix: app://-Schema VOR whenReady registrieren (Electron-Pflicht).
// file:// hat Origin 'null' → ES-Module scheitern. app:// gibt echte Origin → Module laden korrekt.
registerAppScheme()

// Single-Instance-Sperre: verhindert zwei gleichzeitig laufende Instanzen (Datenverlust-Schutz).
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  // Zweite Instanz: sofort beenden, kein Fenster öffnen.
  app.quit()
}

// Modulweite Fensterreferenz für second-instance-Handler.
let mainWindow: BrowserWindow | null = null
const trustedRenderer = { devUrl: process.env.ELECTRON_RENDERER_URL }
installTrustedIpcGuard(ipcMain, () => mainWindow, trustedRenderer)

// Phase 1: read-only Config-Dashboard. contextIsolation an, kein nodeIntegration.
// Nur Main liest das Dateisystem; Renderer bekommt Daten ausschliesslich ueber Preload.
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'RaWaLLMConfig',
    backgroundColor: '#ece3d6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow = win
  hardenWindowNavigation(win, trustedRenderer, (url) => shell.openExternal(url))
  // DevTools-Zugang nur in Dev oder mit RAWALLM_DEVTOOLS=1.
  enableDevtools(win)
  win.once('closed', () => { mainWindow = null })
  win.once('ready-to-show', () => win.show())

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    // Production: app:// statt file:// (Origin 'null' wuerde ES-Module blockieren).
    win.loadURL('app://host/index.html')
    win.webContents.once('did-fail-load', (_evt, errCode, errDesc, url) => {
      console.error(`[main] did-fail-load: ${errCode} ${errDesc} (url: ${url})`)
    })
  }
}

// Erste Instanz: zweite Instanz-Anfragen abfangen und vorhandenes Fenster fokussieren.
if (gotTheLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app
  .whenReady()
  .then(async () => {
    // Sicherheitsnetz: Falls doch kein Lock (sollte durch frühen quit() nie erreicht werden).
    if (!gotTheLock) return
    // app://-Protocol-Handler registrieren (nur Production; Dev nutzt Vite-DevServer).
    if (!process.env.ELECTRON_RENDERER_URL) {
      handleAppProtocol()
    }
    try {
      registerIpc()
    } catch (err) {
      console.error('[main] registerIpc fehlgeschlagen', err)
    }
    // Phase 2 (Welle 3): kompletten Write-/neuen-Read-Layer registrieren —
    // Basis (apply + config:readFull) + Reconcile + Prefs/Explain ueber den
    // gebuendelten Registrar. registerWrite ist async (MariaDB-Probe oder File-Fallback).
    // Graceful: ein Fehler hier laesst die read-only-App weiter starten.
    try {
      await registerWrite()
    } catch (err) {
      console.error('[main] registerWrite fehlgeschlagen', err)
    }
    // Update-Manager-IPC registrieren (nach registerWrite, vor createWindow).
    // Getter-Closure () => mainWindow: Aufloesung zum send-Zeitpunkt (R7).
    try {
      registerUpdatesIpc(() => mainWindow)
    } catch (err) {
      console.error('[main] registerUpdatesIpc fehlgeschlagen', err)
    }
    // Teardown: MariaDB-Pool sauber schliessen beim App-Ende.
    app.on('before-quit', () => {
      stopConfigWatcher()
      void endPool()
    })
    createWindow()
    startConfigWatcher(() => mainWindow)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((err) => console.error('[main] whenReady fehlgeschlagen', err))

app.on('window-all-closed', () => {
  stopConfigWatcher()
  if (process.platform !== 'darwin') app.quit()
})
