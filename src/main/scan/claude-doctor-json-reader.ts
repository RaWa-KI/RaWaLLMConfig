// claude-doctor-json-reader.ts — Read-once-JSON-Zugang fuer D1-D11 (HR27-Split
// aus claude-doctor-context.ts). Liefert Coverage/Issues je Quelle; rohe
// Inhalte verlassen den Reader nicht. Security 2026-08-14 (unbounded doctor
// reads): Size-Guard pro Quelldatei — Riesen-JSONs (z. B. eine aufgeblaehte
// ~/.claude.json) werden nicht mehr synchron in den Main-Prozess gelesen
// (Freeze/OOM), sondern als 'unavailable' + Issue 'too-large' quittiert.
import fs from 'node:fs'
import path from 'node:path'

export type DoctorSourceKind = 'claude-state' | 'settings' | 'installed-plugins' | 'known-marketplaces'
  | 'project-mcp' | 'plugin-mcp' | 'port-registry'
export interface DoctorSourceRef { kind: DoctorSourceKind; basename: string }
export interface DoctorSourceCoverage extends DoctorSourceRef {
  status: 'read' | 'unavailable' | 'invalid'; reads: 1
}
export interface DoctorSourceIssue extends DoctorSourceRef { issue: 'unavailable' | 'invalid-json' | 'too-large' }

// Grosszuegig ueber echten State-Groessen (claude.json kann legitim einige MB
// haben), blockt aber DoS-relevante Bomben. Ueber deps.maxJsonBytes injizierbar.
export const MAX_DOCTOR_JSON_BYTES = 16 * 1024 ** 2

export interface JsonReader {
  read(kind: DoctorSourceKind, filePath: string | null | undefined): unknown | null
  status(filePath: string | null | undefined): DoctorSourceCoverage['status'] | undefined
  coverage: DoctorSourceCoverage[]; issues: DoctorSourceIssue[]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function sourceRef(kind: DoctorSourceKind, filePath: string): DoctorSourceRef {
  return { kind, basename: path.basename(filePath) }
}

export function createJsonReader(readText: (filePath: string) => string, maxJsonBytes: number): JsonReader {
  const cache = new Map<string, unknown | null>()
  const states = new Map<string, DoctorSourceCoverage['status']>()
  const coverage: DoctorSourceCoverage[] = []
  const issues: DoctorSourceIssue[] = []
  function read(kind: DoctorSourceKind, filePath: string | null | undefined): unknown | null {
    if (!filePath) return null
    const key = process.platform === 'win32' ? path.resolve(filePath).toLowerCase() : path.resolve(filePath)
    if (cache.has(key)) return cache.get(key) ?? null
    // Size-Guard: Riesen-Quellen nicht synchron lesen. stat-Fehler (injizierte
    // Pfade ohne reale Datei) -> unveraendert den readText-Pfad entscheiden lassen.
    try {
      if (fs.statSync(filePath).size > maxJsonBytes) {
        cache.set(key, null); states.set(key, 'unavailable')
        coverage.push({ ...sourceRef(kind, filePath), status: 'unavailable', reads: 1 })
        issues.push({ ...sourceRef(kind, filePath), issue: 'too-large' }); return null
      }
    } catch { /* stat nicht moeglich -> readText entscheidet (Injektion/Fehlerpfad) */ }
    let raw: string
    try { raw = readText(filePath) } catch {
      cache.set(key, null); states.set(key, 'unavailable')
      coverage.push({ ...sourceRef(kind, filePath), status: 'unavailable', reads: 1 })
      issues.push({ ...sourceRef(kind, filePath), issue: 'unavailable' }); return null
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      cache.set(key, parsed); states.set(key, 'read')
      coverage.push({ ...sourceRef(kind, filePath), status: 'read', reads: 1 }); return parsed
    } catch {
      cache.set(key, null); states.set(key, 'invalid')
      coverage.push({ ...sourceRef(kind, filePath), status: 'invalid', reads: 1 })
      issues.push({ ...sourceRef(kind, filePath), issue: 'invalid-json' }); return null
    }
  }
  const status = (filePath: string | null | undefined): DoctorSourceCoverage['status'] | undefined => {
    if (!filePath) return undefined
    const key = process.platform === 'win32' ? path.resolve(filePath).toLowerCase() : path.resolve(filePath)
    return states.get(key)
  }
  return { read, status, coverage, issues }
}
