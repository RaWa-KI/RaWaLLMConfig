// registry-audit.ts — C-04/A1-2 isolierter Registry-Audit.
// Prueft absolute Pfade read-only; keine Registry-Pflege.
import path from 'node:path'
import { pathExists, readJsonFile } from './c04-scan-helpers'

export interface RegistryAuditInput {
  workspacesJsonPath?: string
  governanceDependenciesPath?: string
}

export interface RegistryDriftFinding {
  kind: 'registry-drift'
  wsKey: string
  path: string
  reason: string
  field: string
}

export function auditRegistryPaths(input: RegistryAuditInput): RegistryDriftFinding[] {
  return [
    ...auditWorkspaces(input.workspacesJsonPath),
    ...auditGovernanceDependencies(input.governanceDependenciesPath),
  ]
}

function auditWorkspaces(registryPath: string | undefined): RegistryDriftFinding[] {
  if (!registryPath) return []
  const data = readJsonFile(registryPath)
  const out: RegistryDriftFinding[] = []
  for (const [wsKey, node] of workspaceNodes(data)) {
    const local = stringField(node, 'path_local')
    if (local) pushIfDead(out, wsKey, 'path_local', local)
  }
  return out
}

function workspaceNodes(data: unknown): Array<[string, unknown]> {
  if (Array.isArray(data)) return data.map((node, i) => [stringField(node, 'key') || String(i), node])
  if (!isRecord(data)) return []
  const nested = data.workspaces
  if (Array.isArray(nested)) return workspaceNodes(nested)
  if (isRecord(nested)) return Object.entries(nested)
  return Object.entries(data)
}

function auditGovernanceDependencies(registryPath: string | undefined): RegistryDriftFinding[] {
  if (!registryPath) return []
  const data = readJsonFile(registryPath)
  const out: RegistryDriftFinding[] = []
  walkDependencyNodes(data, [], out)
  return out
}

function walkDependencyNodes(node: unknown, trail: string[], out: RegistryDriftFinding[]): void {
  if (!isRecord(node)) return
  for (const field of ['canonical_source', 'loader_path']) {
    const value = stringField(node, field)
    if (value) pushIfDead(out, trail.join('.') || 'governance-dependencies', field, value)
  }
  for (const [key, value] of Object.entries(node)) {
    if (isRecord(value)) walkDependencyNodes(value, [...trail, key], out)
  }
}

function pushIfDead(out: RegistryDriftFinding[], wsKey: string, field: string, value: string): void {
  if (!path.isAbsolute(value)) return
  if (pathExists(value)) return
  out.push({ kind: 'registry-drift', wsKey, path: value, field, reason: 'absolute-path-missing' })
}

function stringField(node: unknown, field: string): string {
  if (!isRecord(node)) return ''
  return typeof node[field] === 'string' ? node[field] : ''
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return !!node && typeof node === 'object' && !Array.isArray(node)
}
