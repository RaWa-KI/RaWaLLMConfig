// cli-version-live.ts — Read-only Live-Versions-Reader (Main-Prozess).
// Fuehrt `<bin> <args>` aus und parst die erste SemVer-artige Nummer aus
// stdout+stderr (manche Tools schreiben `--version` nach stderr).
//
// SICHERHEIT: bin/args sind ausschliesslich hardcodiert (kein User-Input,
// siehe watcher-live.ts / sys-scan.ts). Deshalb ist `shell: true` hier sicher
// und noetig: pnpm ist unter Windows ein .cmd-Shim und laesst sich ohne Shell
// nicht starten. Es werden NUR Versionsnummern erfasst — keine Secrets/Werte.
//
// WP-F4F9 (2026-08-07): readToolVersionResult unterscheidet den FEHLERGRUND
// (Tool nicht im PATH / Timeout / keine Version im Output). Vorher war jeder
// Fehler ein schlichtes null und wurde im UI als „veraltet" beschriftet.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

export interface ToolSpec {
  id: string
  bin: string
  args: string[]
}

// Ergebnis einer Live-Versionspruefung: version bei Erfolg, sonst error-Grund.
// error ist ein stabiler Maschinen-Schluessel (kein Freitext mit Pfaden).
export interface ToolVersionResult {
  version: string | null
  error: 'cli-not-in-path' | 'cli-timeout' | 'cli-no-version-output' | null
}

// Erste SemVer-artige Nummer (major.minor[.patch]) aus dem Output.
const SEMVER_RE = /(\d+\.\d+(?:\.\d+)?)/

const execFileAsync = promisify(execFile)

function parseVersion(out: string): string | null {
  const m = out.match(SEMVER_RE)
  return m ? m[1] : null
}

// Klassifiziert den Spawn-Fehler: ENOENT = Binary nicht im PATH, killed/
// timedOut = Timeout, sonst (Nicht-0-Exit ohne parsebare Version) keine
// Versionsausgabe. Keine Fehlertexte/Pfade nach aussen (kein Secret-Risiko,
// aber stabile Schluessel sind testbar und uebersetzbar).
function classifyError(err: unknown): NonNullable<ToolVersionResult['error']> {
  const e = err as { code?: unknown; killed?: unknown; signal?: unknown }
  if (e?.code === 'ENOENT') return 'cli-not-in-path'
  if (e?.killed === true || e?.signal === 'SIGTERM') return 'cli-timeout'
  return 'cli-no-version-output'
}

// PATH-unabhaengige Kandidaten fuer bekannte CLI-Installationsorte
// (Owner-Befund 2026-08-07): die installierte Electron-App erbt den PATH vom
// Explorer — fehlen dort die Shim-Ordner, scheitert der Spawn, obwohl die CLI
// installiert ist, und die Ansicht faellt auf die stale Daemon-Datei zurueck.
// Generische Standard-Orte (public-safe, keine Privatpfade): der native
// Standalone-Ordner ~/.local/bin und das npm-Global-Verzeichnis %APPDATA%/npm.
// Erster existierender Kandidat gewinnt; sonst bleibt der PATH-Weg.
export function resolveBinCandidate(bin: string, exists: (p: string) => boolean = existsSync): string {
  if (bin.includes('/') || bin.includes('\\')) return bin
  const home = homedir()
  const candidates = process.platform === 'win32'
    ? [
        join(home, '.local', 'bin', `${bin}.exe`),
        join(home, '.local', 'bin', `${bin}.cmd`),
        ...(process.env.APPDATA ? [join(process.env.APPDATA, 'npm', `${bin}.cmd`)] : [])
      ]
    : [join(home, '.local', 'bin', bin)]
  for (const c of candidates) {
    try { if (exists(c)) return c } catch { /* graceful */ }
  }
  return bin
}

// shell:true verschluckt ENOENT: eine unbekannte CLI endet als Nicht-0-Exit
// mit „not recognized"/„command not found" im stderr — das ist ein
// PATH-Problem, keine fehlende Versionsausgabe.
function isNotFoundOutput(out: string): boolean {
  return /not recognized|command not found|kann den Begriff|ist entweder falsch geschrieben/i.test(out)
}

// Liest die Tool-Version non-blocking via promisify(execFile) (PERF-HOCH-01).
// Liefert IMMER ein ToolVersionResult: bei Erfolg version, sonst error-Grund.
// Auch Nicht-0-Exit wird noch auf eine Version im Output geprueft (manche
// Tools schreiben `--version` nach stderr und exiten != 0).
export async function readToolVersionResult(bin: string, args: string[]): Promise<ToolVersionResult> {
  // Bekannte Installationsorte gewinnen vor dem (moeglicherweise stalen)
  // Explorer-PATH der installierten App.
  const resolved = resolveBinCandidate(bin)
  try {
    // shell:true noetig fuer .cmd-Shims (pnpm); bin/args sind hardcodiert.
    // windowsHide ohne Konsolenfenster. Aufgeloeste Pfade mit Leerzeichen
    // fuer die Shell quoten.
    const cmd = resolved.includes(' ') ? `"${resolved}"` : resolved
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      shell: true,
      timeout: 2500,
      windowsHide: true,
      encoding: 'utf8'
    })
    const version = parseVersion(`${String(stdout ?? '')}\n${String(stderr ?? '')}`)
    return version ? { version, error: null } : { version: null, error: 'cli-no-version-output' }
  } catch (err) {
    // promisify(execFile) rejected bei Nicht-0-Exit; der Error traegt stdout/
    // stderr als Properties — erst parsen, dann klassifizieren.
    const e = err as { stdout?: unknown; stderr?: unknown }
    const out = `${String(e?.stdout ?? '')}\n${String(e?.stderr ?? '')}`
    const version = parseVersion(out)
    if (version) return { version, error: null }
    if (isNotFoundOutput(out)) return { version: null, error: 'cli-not-in-path' }
    return { version: null, error: classifyError(err) }
  }
}

// WP-F4F9: lesbarer Grundtext je Maschinen-Schluessel. Wichtig: „nicht
// pruefbar" ist KEIN „veraltet" — ein Spawn-Fehler sagt nichts ueber die
// installierte Version aus.
export function liveErrorText(error: ToolVersionResult['error']): string {
  if (error === 'cli-not-in-path') return 'CLI nicht im PATH gefunden'
  if (error === 'cli-timeout') return 'Zeitueberschreitung bei der Versionsabfrage'
  return 'keine Versionsausgabe erhalten'
}

