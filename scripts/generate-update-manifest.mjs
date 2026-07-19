/**
 * generate-update-manifest.mjs
 * Erzeugt latest.json + kopiert vorhandene Release-Artefakte in RAWALLM_UPDATE_DIR.
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
// 2. Release-Artefakte lokalisieren (per electron-builder.yml: output = dist-release)
// ---------------------------------------------------------------------------
const distDir  = resolve(process.env.RAWALLM_DIST_DIR ?? join(repoRoot, 'dist-release'))

const ARTIFACT_SPECS = [
  { name: `RaWaLLMConfig-Setup-${version}.exe`, contentType: 'application/x-msdownload', required: true },
  { name: `RaWaLLMConfig-${version}.AppImage`, contentType: 'application/x-appimage' },
  { name: `RaWaLLMConfig-${version}.deb`, contentType: 'application/vnd.debian.binary-package' },
  { name: `RaWaLLMConfig-${version}.rpm`, contentType: 'application/x-rpm' }
]

function readArtifact(spec) {
  const filePath = join(distDir, spec.name)
  if (!existsSync(filePath)) {
    if (spec.required) {
      console.error(`[generate-update-manifest] Pflicht-Artefakt nicht gefunden: ${filePath}`)
      console.error('Zuerst "pnpm dist:win" ausfuehren.')
      process.exit(1)
    }
    return null
  }
  const buf = readFileSync(filePath)
  return {
    ...spec,
    filePath,
    size: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex')
  }
}

const artifacts = ARTIFACT_SPECS.map(readArtifact).filter(Boolean)

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

/** @type {object} */
const manifest = {
  tag_name:     `v${version}`,
  name:         `RaWaLLMConfig ${version}`,
  body,
  published_at: now,
  prerelease:   false,
  assets: artifacts.map((artifact) => ({
    name:                 artifact.name,
    browser_download_url: `${publicAssetBase}/${encodeURIComponent(artifact.name)}`,
    size:                 artifact.size,
    content_type:         artifact.contentType,
    download_count:       0,
    sha256:               artifact.sha256
  }))
}

const manifestPath = join(updateDir, 'latest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
console.log(`[OK] latest.json     -> ${manifestPath}`)

// ---------------------------------------------------------------------------
// 7. Artefakte in updateDir kopieren (skip wenn Quelle === Ziel)
// ---------------------------------------------------------------------------
for (const artifact of artifacts) {
  const destPath = join(updateDir, artifact.name)
  if (resolve(artifact.filePath) !== resolve(destPath)) {
    copyFileSync(artifact.filePath, destPath)
    console.log(`[OK] Artefakt kopiert -> ${destPath}`)
  } else {
    console.log(`[OK] Artefakt liegt bereits im Zielordner: ${artifact.name}`)
  }
  const sidecarPath = join(updateDir, `${artifact.name}.sha256`)
  writeFileSync(sidecarPath, artifact.sha256.toUpperCase(), 'utf8')
  console.log(`[OK] SHA256-Sidecar  -> ${sidecarPath}`)
}

// ---------------------------------------------------------------------------
// Fertig
// ---------------------------------------------------------------------------
console.log(`\nManifest-Zusammenfassung:`)
console.log(`  version : ${version}`)
console.log(`  assets  : ${artifacts.map((artifact) => artifact.name).join(', ')}`)
console.log(`  updateDir: ${updateDir}`)
