// scan-audit-categories.ts — additive Audit-Familie fuer C-04/C-10 Scanner.
// Read-only: mappt Scanner-Findings auf normale Config-Kategorien.
import path from 'node:path'
import fs from 'node:fs'
import type { Category, ConfigEntry, LlmConfig, Scope } from '@shared/contract'
import { configRoots } from '../services/config-roots'
import { scanAllWikilinks } from './reference-sweep'
import { auditRegistryPaths } from './registry-audit'
import { crosscheckHooks } from './hook-crosscheck'
import { scanHr27 } from './hr27-scan'
import { collectMemoryFiles } from './memory-audit'
import { mtimeSafe } from './scan-helpers'

interface AuditEntry {
  id: string
  name: string
  path: string
  reason: string
  fields?: Record<string, string>
  scope?: Scope
}

export function buildAuditConfig(roots = configRootList()): LlmConfig {
  const cats = [
    cat('audit-references', 'Referenz-Audit', 'list', roots[0] ?? '', refs(roots)),
    cat('audit-registry', 'Registry-Audit', 'list', registryPath(), registry()),
    cat('audit-hooks', 'Hook-Audit', 'hook', roots[0] ?? '', hooks()),
    cat('audit-hr27', 'HR27-Audit', 'rule', roots[0] ?? '', hr27(roots)),
    cat('audit-memory', 'Memory-Audit', 'agent', roots[0] ?? '', memory(memoryRoots())),
  ].filter((c): c is Category => c !== null)
  return { categories: cats, duplicates: [] }
}

function cat(id: string, label: string, icon: string, p: string, rows: AuditEntry[]): Category | null {
  if (rows.length === 0) return null
  return {
    id, label, icon, path: p,
    blurb: `${rows.length} Findings aus read-only Audit-Scannern`,
    entries: rows.map((row) => entry(id, row)),
  }
}

function entry(catId: string, row: AuditEntry): ConfigEntry {
  return {
    id: `${catId}-${slug(row.id)}`,
    name: row.name,
    status: 'conflict',
    scope: row.scope ?? 'project',
    path: row.path,
    desc: row.reason,
    updated: mtimeSafe(row.path),
    fields: row.fields,
    conflictReason: row.reason,
  }
}

function refs(roots: string[]): AuditEntry[] {
  return scanAllWikilinks(roots).map((f) => ({
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

function configRootList(): string[] {
  const r = configRoots()
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

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120)
}
