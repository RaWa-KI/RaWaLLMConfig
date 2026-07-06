/**
 * app-protocol.ts — Custom Protocol 'app://' fuer Production.
 *
 * PROBLEM: file://-Renderer-Loads haben Origin 'null'.
 *   ES-Module mit crossorigin-Attributen → CORS blockiert → React mountet nicht → leeres Fenster.
 * LOESUNG: Custom Protocol 'app://' gibt eine echte Origin (app://host).
 *   Module laden ohne CORS-Fehler. Muster 1:1 aus RawaLite uebernommen.
 *
 * registerAppScheme()  — VOR app.whenReady() aufrufen (Electron-Pflicht).
 * handleAppProtocol() — IN app.whenReady() aufrufen (nach Protocol-Registrierung).
 */

import { protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isPathWithin } from './lib/path-within'

/**
 * Pfad-Traversal-Guard: verhindert Zugriff ausserhalb des Renderer-Verzeichnisses.
 * Nutzt path.relative (plattformneutral) statt String-Vergleich — sonst scheitert
 * der Check auf Windows am Separator-Mismatch (join liefert '\\', String-Suffix war '/').
 * Gleichheit (rendererRoot selbst) zaehlt als innerhalb -> includeEqual=true.
 */
function isWithinBase(base: string, target: string): boolean {
  return isPathWithin(base, target, { includeEqual: true })
}

/**
 * Muss VOR app.whenReady() aufgerufen werden.
 * Registriert 'app' als privilegiertes Schema (standard + secure → gilt als 'self' in CSP).
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'app',
    privileges: {
      standard: true,      // behandelt wie http/https (Origin-Modell)
      secure: true,        // zaehlt als HTTPS → 'self' in CSP greift
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    }
  }])
}

/**
 * Muss IN app.whenReady() aufgerufen werden.
 * Mappt app://host/<pfad> auf Renderer-Dateien im electron-vite-Layout:
 *   out/main/index.js  → __dirname = out/main/
 *   out/renderer/       → join(__dirname, '../renderer')
 * Funktioniert sowohl in win-unpacked als auch im gepackten asar.
 */
export function handleAppProtocol(): void {
  // Renderer-Root: out/renderer/ relativ zu out/main/ (__dirname).
  const rendererRoot = join(__dirname, '../renderer')

  protocol.handle('app', (request) => {
    let urlPath = new URL(request.url).pathname
    // Windows: fuehrenden Slash entfernen (URL-Parsing liefert '/index.html').
    if (process.platform === 'win32' && urlPath.startsWith('/')) {
      urlPath = urlPath.slice(1)
    }
    const filePath = join(rendererRoot, urlPath)
    // Path-Traversal-Guard: kein Zugriff ausserhalb rendererRoot erlaubt.
    if (!isWithinBase(rendererRoot, filePath)) {
      console.error(`[app-protocol] Path-Traversal blockiert: ${urlPath}`)
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })
}
