// cli-version-live.ts — Read-only Live-Versions-Reader (Main-Prozess).
// Fuehrt `<bin> <args>` aus und parst die erste SemVer-artige Nummer aus
// stdout+stderr (manche Tools schreiben `--version` nach stderr).
//
// SICHERHEIT: bin/args sind ausschliesslich hardcodiert (kein User-Input,
// siehe watcher-live.ts / sys-scan.ts). Deshalb ist `shell: true` hier sicher
// und noetig: pnpm ist unter Windows ein .cmd-Shim und laesst sich ohne Shell
// nicht starten. Es werden NUR Versionsnummern erfasst — keine Secrets/Werte.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export interface ToolSpec {
  id: string
  bin: string
  args: string[]
}

// Erste SemVer-artige Nummer (major.minor[.patch]) aus dem Output.
const SEMVER_RE = /(\d+\.\d+(?:\.\d+)?)/

const execFileAsync = promisify(execFile)

// Liest die Tool-Version non-blocking via promisify(execFile) (PERF-HOCH-01;
// der fruehere sync-Pfad readToolVersion/readVersions ist entfernt — Aufrufer
// gehen ueber cli-version-cache.getVersionsCached).
// Bei JEDEM Fehler (ENOENT/Timeout/Nicht-0-Exit/Exception) graceful null.
export async function readToolVersionAsync(bin: string, args: string[]): Promise<string | null> {
  try {
    // shell:true noetig fuer .cmd-Shims (pnpm); bin/args sind hardcodiert.
    // execFile piped stdout+stderr per Default — beide parsen, manche Tools
    // schreiben `--version` nach stderr. windowsHide ohne Konsolenfenster.
    const { stdout, stderr } = await execFileAsync(bin, args, {
      shell: true,
      timeout: 2500,
      windowsHide: true,
      encoding: 'utf8'
    })
    const m = `${String(stdout ?? '')}\n${String(stderr ?? '')}`.match(SEMVER_RE)
    return m ? m[1] : null
  } catch (err) {
    // promisify(execFile) rejected bei Nicht-0-Exit; der Error traegt stdout/
    // stderr als Properties — wie im sync-catch kombinieren und parsen, sonst
    // gehen Versionen von Tools mit Nicht-0-Exit verloren.
    const e = err as { stdout?: unknown; stderr?: unknown }
    const combined = `${String(e?.stdout ?? '')}\n${String(e?.stderr ?? '')}`
    const m = combined.match(SEMVER_RE)
    return m ? m[1] : null
  }
}
