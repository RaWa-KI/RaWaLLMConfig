/**
 * generate-update-manifest.mjs
 * Erzeugt latest.json + kopiert den NSIS-Installer in RAWALLM_UPDATE_DIR.
 * Kein Upload, kein scp, kein Publish.
 * Nur Node-Builtins (fs, crypto, path, url).
 *
 * Verwendung:
 *   $env:RAWALLM_UPDATE_DIR = "C:\pfad\zu\update-ordner"
 *   node scripts/generate-update-manifest.mjs
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireReleaseNotesGate } from './release/changelog-gate.mjs'

// ---------------------------------------------------------------------------
// Pfade
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const repoRoot   = resolve(__dirname, '..')
const publicAssetBase =
  (process.env.RAWALLM_RELEASE_ASSET_BASE_URL ?? 'https://github.com/RaWa-KI/RaWaLLMConfig/releases/latest/download')
    .replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// 1. Version aus package.json
// ---------------------------------------------------------------------------
const pkgPath = join(repoRoot, 'package.json')
const pkg     = JSON.parse(readFileSync(pkgPath, 'utf8'))
const version = pkg.version   // z.B. "0.1.0"

// ---------------------------------------------------------------------------
// 2. NSIS-Installer lokalisieren (per electron-builder.yml: output = dist-release,
//    artifactName = "RaWaLLMConfig-Setup-${version}.${ext}")
// ---------------------------------------------------------------------------
const exeName  = `RaWaLLMConfig-Setup-${version}.exe`
const distDir  = join(repoRoot, 'dist-release')
const exePath  = join(distDir, exeName)

if (!existsSync(exePath)) {
  console.error(`[generate-update-manifest] Installer nicht gefunden: ${exePath}`)
  console.error('Zuerst "npm run dist" ausfuehren.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 3. Groesse + SHA256 (lowercase)
// ---------------------------------------------------------------------------
const exeBuf = readFileSync(exePath)
const size   = exeBuf.length
const sha256 = createHash('sha256').update(exeBuf).digest('hex')  // lowercase

// ---------------------------------------------------------------------------
// 4. Release-Notes (Pflicht: Deutsch + Chat-Freigabe vor Manifest/Upload)
// ---------------------------------------------------------------------------
const notesPath = join(repoRoot, 'RELEASE_NOTES.md')
let body = ''
try {
  body = requireReleaseNotesGate({ notesPath, version })
} catch (error) {
  console.error(`[generate-update-manifest] ${error.message}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 5. RAWALLM_UPDATE_DIR pruefen + Ordner anlegen
// ---------------------------------------------------------------------------
const updateDir = (process.env.RAWALLM_UPDATE_DIR ?? '').trim()
if (!updateDir) {
  console.error('[generate-update-manifest] Umgebungsvariable RAWALLM_UPDATE_DIR ist nicht gesetzt.')
  console.error('Beispiel: $env:RAWALLM_UPDATE_DIR = "C:\\rawallm-updates"')
  process.exit(1)
}

mkdirSync(updateDir, { recursive: true })

// ---------------------------------------------------------------------------
// 6. latest.json schreiben
// ---------------------------------------------------------------------------
const now         = new Date().toISOString()
const downloadUrl = `${publicAssetBase}/${encodeURIComponent(exeName)}`

/** @type {object} */
const manifest = {
  tag_name:     `v${version}`,
  name:         `RaWaLLMConfig ${version}`,
  body,
  published_at: now,
  prerelease:   false,
  assets: [
    {
      name:                 exeName,
      browser_download_url: downloadUrl,
      size,
      content_type:         'application/x-msdownload',
      download_count:       0,
      sha256               // lowercase
    }
  ]
}

const manifestPath = join(updateDir, 'latest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
console.log(`[OK] latest.json     -> ${manifestPath}`)

// ---------------------------------------------------------------------------
// 7. Installer in updateDir kopieren (skip wenn Quelle === Ziel)
// ---------------------------------------------------------------------------
const destExe    = join(updateDir, exeName)
const srcResolved  = resolve(exePath)
const destResolved = resolve(destExe)

if (srcResolved !== destResolved) {
  copyFileSync(exePath, destExe)
  console.log(`[OK] Installer kopiert -> ${destExe}`)
} else {
  console.log(`[OK] Installer liegt bereits im Zielordner, kein Kopieren noetig.`)
}

// ---------------------------------------------------------------------------
// 8. SHA256-Sidecar schreiben (UPPERCASE, kein Newline — nur Paritaet,
//    NICHT im aktiven Update-Flow gelesen)
// ---------------------------------------------------------------------------
const sidecarPath = join(updateDir, `${exeName}.sha256`)
writeFileSync(sidecarPath, sha256.toUpperCase(), 'utf8')
console.log(`[OK] SHA256-Sidecar  -> ${sidecarPath}`)

// ---------------------------------------------------------------------------
// Fertig
// ---------------------------------------------------------------------------
console.log(`\nManifest-Zusammenfassung:`)
console.log(`  version : ${version}`)
console.log(`  exeName : ${exeName}`)
console.log(`  size    : ${size} Bytes`)
console.log(`  sha256  : ${sha256}`)
console.log(`  updateDir: ${updateDir}`)
