// scan-audit-categories.ts — additive Audit-Familie fuer C-04/C-10 Scanner.
// Read-only: mappt Scanner-Findings auf normale Config-Kategorien.
import path from 'node:path'
import fs from 'node:fs'
import type { Category, ConfigEntry, CoverageItem, LlmConfig, Scope } from '@shared/contract'
import { normalizePathForCompare } from '@shared/path-compare'
import { configRoots, workspaceRoots } from '../services/config-roots'
import type { ConfigRoots } from '../services/config-roots'
import { scanAllWikilinks } from './reference-sweep'
import { auditRegistryPaths } from './registry-audit'
import { crosscheckHooks } from './hook-crosscheck'
import { scanHr27 } from './hr27-scan'
import { collectMemoryFiles } from './memory-audit'
import { mtimeSafe } from './scan-helpers'
import { buildClaudeDoctorCategories } from './claude-doctor-audit'
import { buildClaudeDoctorCategoriesAsync } from './claude-doctor-audit-async'

interface AuditEntry {
  id: string
  name: string
  path: string
  reason: string
  fields?: Record<string, string>
  scope?: Scope
}

export function buildAuditConfig(): LlmConfig {
  const roots = configRoots()
  const anchor = roots.projectRoot ?? roots.sharedClaude ?? ''
  const cats = [
    cat('audit-references', 'Referenz-Audit', 'list', anchor, refs(wikilinkScanSpec(roots))),
    cat('audit-registry', 'Registry-Audit', 'list', registryPath(), registry()),
    cat('audit-hooks', 'Hook-Audit', 'hook', anchor, hooks()),
    cat('audit-hr27', 'HR27-Audit', 'rule', anchor, hr27(hr27Roots(roots))),
    cat('audit-memory', 'Memory-Audit', 'agent', anchor, memory(memoryRoots())),
    ...buildClaudeDoctorCategories(),
  ].filter((c): c is Category => c !== null)
  return { categories: cats, duplicates: [] }
}

export async function buildAuditConfigAsync(): Promise<LlmConfig> {
  const roots = configRoots()
  const anchor = roots.projectRoot ?? roots.sharedClaude ?? ''
  const cats = [
    cat('audit-references', 'Referenz-Audit', 'list', anchor, refs(wikilinkScanSpec(roots))),
    cat('audit-registry', 'Registry-Audit', 'list', registryPath(), registry()),
    cat('audit-hooks', 'Hook-Audit', 'hook', anchor, hooks()),
    cat('audit-hr27', 'HR27-Audit', 'rule', anchor, hr27(hr27Roots(roots))),
    cat('audit-memory', 'Memory-Audit', 'agent', anchor, memory(memoryRoots())),
    ...await buildClaudeDoctorCategoriesAsync(),
  ].filter((category): category is Category => category !== null)
  return { categories: cats, duplicates: [] }
}

function cat(id: string, label: string, icon: string, p: string, rows: AuditEntry[]): Category | null {
  if (rows.length === 0) return null
  return {
    id, label, icon, path: p,
    blurb: `${rows.length} Fundstellen aus read-only Audit-Scannern`,
    entries: [summaryEntry(id, label, rows, p)],
  }
}

// WP-F3: Fundstellen-Kappung an der Datenquelle — die Summary trägt die
// ersten Einträge als explorierbare Liste, der Renderer zeigt „+ n weitere".
const COVERAGE_ITEM_CAP = 20

// B10-Buendelung: max. EINE Karte je Audit-Kategorie mit Zaehler (Kartenflut-
// Fix). Verifiziert: data.audit-Findings laufen NICHT ueber die Diagnose-
// Karten (isCoverageInfoEntry mit familyId 'audit' filtert sie dort heraus —
// Register-only seit Masterplan Teil E); die Register-Zeilen entstehen direkt
// aus diesen Eintraegen, daher sitzt die Buendelung hier an der Datenquelle.
// WP-F3: Der Name traegt keine nackte Zahl mehr (F3, Laien-Schreck); der
// Zaehler steht in desc/fields, die konkreten Fundstellen in coverageItems.
function summaryEntry(catId: string, label: string, rows: AuditEntry[], p: string): ConfigEntry {
  const examples = rows.slice(0, 3).map((row) => row.name).join(', ')
  const reason = rows.length <= 3 ? `Fundstellen: ${examples}` : `${rows.length} Fundstellen, z. B.: ${examples}`
  return {
    id: `${catId}-summary`,
    name: `Prüfergebnisse: ${label}`,
    status: 'conflict',
    scope: 'project',
    path: p,
    desc: reason,
    updated: mtimeSafe(p),
    fields: { Fundstellen: String(rows.length), Kategorie: label },
    conflictReason: reason,
    coverageItems: coverageItemsOf(rows),
    coverageItemsTotal: rows.length,
  }
}

// Fundstellen-Liste (Name + Pfad), gekappt auf die ersten COVERAGE_ITEM_CAP.
function coverageItemsOf(rows: AuditEntry[]): CoverageItem[] {
  return rows.slice(0, COVERAGE_ITEM_CAP).map((row) => ({ name: row.name, path: row.path }))
}

interface WikilinkScanSpec {
  roots: string[]
  extraFiles: string[]
}

function refs(spec: WikilinkScanSpec): AuditEntry[] {
  return scanAllWikilinks(spec.roots, spec.extraFiles).map((f) => ({
    id: `${f.filePath}-${f.line}-${f.target}`,
    name: f.target,
    path: f.filePath,
    reason: `Toter Wikilink in Zeile ${f.line}`,
    fields: { Zeile: String(f.line), Ziel: f.target },
  }))
}

function registry(): AuditEntry[] {
  return auditRegistryPaths(registryInput()).map((f) => ({
    id: `${f.wsKey}-${f.field}-${f.path}`,
    name: f.wsKey,
    path: f.path,
    reason: `${f.field}: Pfad existiert nicht`,
    fields: { Feld: f.field, Pfad: f.path },
    scope: 'shared',
  }))
}

function hooks(): AuditEntry[] {
  const r = configRoots()
  return crosscheckHooks({
    registrationFiles: [path.join(r.claudeHome, 'settings.json'), path.join(r.codexHome, 'hooks.json')],
    hookDirs: [path.join(r.claudeHome, 'hooks'), path.join(r.codexHome, 'hooks')],
  }).map((f) => ({
    id: f.kind === 'orphan-script' ? f.filePath : `${f.filePath}-${f.commandPath}`,
    name: f.kind === 'orphan-script' ? path.basename(f.filePath) : path.basename(f.commandPath),
    path: f.filePath,
    reason: f.kind === 'orphan-script' ? 'Hook-Skript ist nicht registriert' : 'Hook-Command zeigt auf fehlendes Skript',
    fields: f.kind === 'orphan-script' ? { Art: f.kind } : hookFields(f.kind, f.command),
  }))
}

function hookFields(kind: string, command: string): Record<string, string> {
  return { Art: kind, Command: command }
}

function hr27(roots: string[]): AuditEntry[] {
  return roots.flatMap((root) => scanHr27(root)).map((f) => ({
    id: f.path,
    name: path.basename(f.path),
    path: f.path,
    reason: `HR27-Limit ${f.limit} Zeilen um ${f.overshoot} ueberschritten`,
    fields: { Zeilen: String(f.lines), Limit: String(f.limit), Endung: f.ext },
  }))
}

function memory(roots: string[]): AuditEntry[] {
  return memoryDirs(roots).flatMap((dir) => {
    const audit = collectMemoryFiles(dir)
    const a = audit.missingInIndex.map((name) => memoryEntry(dir, name, 'Fehlt in MEMORY.md-Index'))
    const b = audit.missingOnDisk.map((name) => memoryEntry(dir, name, 'Fehlt als _memory-Datei'))
    return [...a, ...b]
  })
}

function memoryEntry(dir: string, name: string, reason: string): AuditEntry {
  return { id: `${dir}-${name}-${reason}`, name, path: dir, reason, fields: { Memory: name } }
}

function memoryDirs(roots: string[]): string[] {
  const out: string[] = []
  for (const root of roots) collectMemoryDirs(root, out)
  return [...new Set(out)]
}

// B10: Wikilink-Sweep-Wurzeln — bisher nur projectRoot + sharedClaude,
// weshalb Links auf Dateien in den Tool-Homes (~/.claude, ~/.codex) oder in
// registrierten Nachbar-Workspaces faelschlich als tot gemeldet wurden.
// SCOPE-BEGRENZUNG (Performance, Pflicht): Tool-Homes und Workspace-Wurzeln
// werden NICHT voll gewalkt — nur ihre Config-/Doku-Teilbaeume (bekannte
// Unterordner aus DOC_SUBDIRS) plus ihr Top-Level-Markdown (extraFiles).
// Voll-Quellbaeume (src/, Projekte-Baeume, Plugin-Caches, Session-Daten wie
// ~/.claude/projects) bleiben ausgenommen. projectRoot und sharedClaude
// bleiben Voll-Walk (bisheriges Verhalten, reine Config-/Doku-Baeume).
const DOC_SUBDIRS = new Set([
  '.claude', '.codex', '.kimi-code', '.agents', '.grok',
  'agents', 'skills', 'rules', 'hooks', 'commands', 'docs', 'doc',
])
const DOC_FILE_RX = /\.(md|mdx|txt)$/i

function wikilinkScanSpec(r: ConfigRoots): WikilinkScanSpec {
  const roots: string[] = []
  const extraFiles: string[] = []
  if (r.projectRoot) roots.push(r.projectRoot)
  if (r.sharedClaude) roots.push(r.sharedClaude)
  collectDocTargets(r.claudeHome, roots, extraFiles)
  collectDocTargets(r.codexHome, roots, extraFiles)
  for (const ws of workspaceRoots()) {
    // projectRoot wird bereits voll gewalkt — keine Doppelarbeit.
    if (r.projectRoot && normalizePathForCompare(ws.root, process.platform) === normalizePathForCompare(r.projectRoot, process.platform)) continue
    collectDocTargets(ws.root, roots, extraFiles)
  }
  return { roots: [...new Set(roots)], extraFiles: [...new Set(extraFiles)] }
}

function collectDocTargets(root: string, roots: string[], extraFiles: string[]): void {
  let dirents: fs.Dirent[]
  try { dirents = fs.readdirSync(root, { withFileTypes: true }) } catch { return }
  for (const d of dirents) {
    const abs = path.join(root, d.name)
    if (d.isDirectory() && DOC_SUBDIRS.has(d.name.toLowerCase())) roots.push(abs)
    else if (d.isFile() && DOC_FILE_RX.test(d.name)) extraFiles.push(abs)
  }
}

// HR27 bleibt bewusst auf den bisherigen zwei Wurzeln (Scope-Begrenzung):
// Tool-Homes enthalten Plugin-Caches, Workspace-Wurzeln Voll-Quellbaeume —
// scanHr27 darf nicht auf ganze Workspace-Baeume losgelassen werden.
function hr27Roots(r: ConfigRoots): string[] {
  return [r.projectRoot, r.sharedClaude].filter((root): root is string => root !== null)
}

function memoryRoots(): string[] {
  const r = configRoots()
  return [
    path.join(r.claudeHome, 'agents'),
    path.join(r.codexHome, 'agents'),
    ...(r.sharedClaude ? [path.join(r.sharedClaude, 'agents')] : []),
  ]
}

function collectMemoryDirs(dir: string, out: string[]): void {
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  if (entries.some((e) => e.name === 'MEMORY.md' || e.name === '_memory')) out.push(dir)
  for (const e of entries) {
    if (e.isDirectory() && !['.git', 'node_modules', 'dist', 'build'].includes(e.name)) {
      collectMemoryDirs(path.join(dir, e.name), out)
    }
  }
}

function registryInput(): { workspacesJsonPath: string; governanceDependenciesPath: string } {
  const base = registryPath()
  return {
    workspacesJsonPath: path.join(base, 'workspaces.json'),
    governanceDependenciesPath: path.join(base, 'governance-dependencies.json'),
  }
}

function registryPath(): string {
  const sharedRoot = configRoots().sharedClaude
  return sharedRoot ? path.join(sharedRoot, 'coordination', 'registry') : ''
}

