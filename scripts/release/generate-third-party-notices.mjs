import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileExists } from './path-utils.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const packagePath = resolve(repoRoot, 'package.json')
const lockPath = resolve(repoRoot, 'pnpm-lock.yaml')
const outputPath = resolve(repoRoot, 'docs/THIRD-PARTY-NOTICES.md')

// Vendored (nicht npm-verwaltete) Drittkomponenten. Nicht aus package.json/
// lockfile ableitbar — Quelle der Wahrheit ist diese Liste.
const VENDORED_ASSETS = [
  {
    name: 'Nunito (WOFF2, Subsets latin + latin-ext, Gewichte 400-900)',
    source: 'fontsource nunito@5.2.7 via jsDelivr, vendored nach src/renderer/assets/fonts/ (OFL.txt liegt dort)',
    license: 'OFL-1.1',
    copyright: 'Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito)'
  },
  {
    name: 'Oswald (WOFF2, Subsets latin + latin-ext, Gewichte 600/700)',
    source: 'fontsource oswald@5.2.8 via jsDelivr, vendored nach src/renderer/assets/fonts/ (OFL-oswald.txt liegt dort)',
    license: 'OFL-1.1',
    copyright: 'Copyright 2016 The Oswald Project Authors (https://github.com/googlefonts/oswald)'
  }
]

async function readJson(pathText) {
  return JSON.parse(await readFile(pathText, 'utf8'))
}

function cleanYamlValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function parseRootLockVersions(lockText) {
  const versions = { dependencies: {}, devDependencies: {} }
  let scope = null
  let currentName = null
  for (const line of lockText.split(/\r?\n/)) {
    if (line === 'packages:') break
    if (/^    (dependencies|devDependencies):$/.test(line)) {
      scope = line.trim().replace(':', '')
      currentName = null
      continue
    }
    const nameMatch = line.match(/^      ('[^']+'|[^:]+):$/)
    if (scope && nameMatch) currentName = cleanYamlValue(nameMatch[1])
    const versionMatch = line.match(/^        version: (.+)$/)
    if (scope && currentName && versionMatch) {
      versions[scope][currentName] = cleanYamlValue(versionMatch[1])
    }
  }
  return versions
}

function packageJsonPath(name) {
  const parts = name.startsWith('@') ? name.split('/') : [name]
  return resolve(repoRoot, 'node_modules', ...parts, 'package.json')
}

async function readPackageLicense(name) {
  const metaPath = packageJsonPath(name)
  if (!(await fileExists(metaPath))) return 'unknown'
  const meta = await readJson(metaPath)
  if (typeof meta.license === 'string') return meta.license
  if (Array.isArray(meta.licenses)) return meta.licenses.map((item) => item.type || item).join(', ')
  return 'unknown'
}

function directRows(pkg, lockVersions, scopeName) {
  const deps = pkg[scopeName] || {}
  return Object.entries(deps).map(([name, specifier]) => ({
    name,
    scope: scopeName,
    specifier,
    resolved: lockVersions[scopeName][name] || 'not-found-in-lock'
  }))
}

async function enrichRows(rows) {
  const enriched = []
  for (const row of rows) {
    enriched.push({ ...row, license: await readPackageLicense(row.name) })
  }
  return enriched
}

export function escapeCell(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
}

function renderTable(rows) {
  const header = '| Package | Scope | Specifier | Lock version | License source |'
  const sep = '|---|---|---|---|---|'
  const body = rows.map((row) => [
    row.name,
    row.scope,
    row.specifier,
    row.resolved,
    row.license
  ].map(escapeCell).join(' | '))
  return [header, sep, ...body.map((line) => `| ${line} |`)].join('\n')
}

function renderVendoredTable(assets) {
  const header = '| Asset | Source | License | Copyright |'
  const sep = '|---|---|---|---|'
  const body = assets.map((asset) => [
    asset.name,
    asset.source,
    asset.license,
    asset.copyright
  ].map(escapeCell).join(' | '))
  return [header, sep, ...body.map((line) => `| ${line} |`)].join('\n')
}

async function renderNotices() {
  const pkg = await readJson(packagePath)
  const lockText = await readFile(lockPath, 'utf8')
  const lockVersions = parseRootLockVersions(lockText)
  const rows = await enrichRows([
    ...directRows(pkg, lockVersions, 'dependencies'),
    ...directRows(pkg, lockVersions, 'devDependencies')
  ].sort((a, b) => a.name.localeCompare(b.name)))
  return [
    '# Third-Party Notices',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Source: package.json direct dependencies plus pnpm-lock.yaml importer versions.',
    'License source: installed package metadata when node_modules is present; otherwise unknown.',
    '',
    'Full transitive SBOM: n/a, no dedicated SBOM generator is part of the Public Alpha gate yet.',
    'Public Alpha gate: this file is a reproducible top-level notice, not a complete legal review.',
    '',
    renderTable(rows),
    '',
    '## Vendored assets (not npm-managed)',
    '',
    renderVendoredTable(VENDORED_ASSETS),
    ''
  ].join('\n')
}

async function main() {
  const content = await renderNotices()
  await writeFile(outputPath, content, 'utf8')
  console.log(`third-party-notices: wrote ${outputPath}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`third-party-notices: FAIL ${error.message}`)
    process.exit(1)
  })
}
