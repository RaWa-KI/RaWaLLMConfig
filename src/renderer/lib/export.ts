// Export (Teil C, WP-08): serialisiert den geladenen Config-Snapshot als
// re-importierbares JSON-Bundle und loest einen Browser-Download aus. KEIN node
// fs/path — nur DOM/Blob-APIs. Secret-Defense-in-depth (F2): content wird NUR
// exportiert, wenn der Scan-Code nicht gekuerzt ist UND der Pfad nicht in die
// Secret-WERT-Klasse faellt ODER der code sichtbar maskiert ist (enthaelt •••).
// Secret-WERT-Klasse via @shared/secret-class (SSOT, browser-sicher) — KEINE
// lokale Spiegelung mehr (QUAL-MITTEL-01-Fix). Bewusste Semantik-Deltas zur
// frueheren Basename-Kopie: (a) STRENGER — Wortheuristik (SECRET_WORD_RX),
// auth.json, .credentials.json, Segment-Klassen u. a. matchen jetzt auch, deren
// content wird nur noch bei sichtbarer •••-Maskierung exportiert (Defense-in-
// depth breiter, nie schwaecher); (b) .md-Ausnahme — z. B. x.env.md klassifiziert
// nicht mehr als Secret-WERT (Owner-Grundprinzip, Paritaet zu WP3). entry.code
// ist beim Scan bereits gekuerzt/maskiert; gekuerzte Entries -> kein content
// (kein Re-Import-Truncation-Zurueckschreiben).
import type { AppData, EntryStatus, System, Watcher } from '@shared/contract'
import { isSecretPathForWrite } from '@shared/secret-class'
import {
  conflictBundleFilename,
  conflictBundleReportMetadata,
  fullBundleFilename,
  fullBundleReportMetadata
} from '@shared/templates/export-report'

const TRUNC_MARK = '… (gekuerzt)'
// Export-Anzeige-Logik (liest die Scan-Maskierung), KEIN Save-Guard-Sentinel.
const MASK_MARK = '•••'

interface ExportPayload {
  config: AppData | null
  system: System | null
  watcher: Watcher | null
}

// Re-importierbarer Entry-Eintrag: Zielpfad + Status. `content` nur, wenn der
// Scan-Code NICHT gekuerzt ist (writable=true). Gekuerzte Entries -> kein content.
export interface ExportEntry {
  llm: string
  cat: string
  status: EntryStatus
  path: string
  name: string
  writable: boolean
  content?: string
}

export interface ExportBundle {
  app: 'rawallmconfig'
  version: 1
  exported: string
  config: AppData | null
  system: System | null
  watcher: Watcher | null
  entries: ExportEntry[]
  filter?: string
}

// Flache, re-importierbare Entry-Liste aus dem Config-Snapshot ableiten.
export function collectEntries(config: AppData | null): ExportEntry[] {
  if (!config) return []
  const out: ExportEntry[] = []
  for (const [llm, conf] of Object.entries(config.data)) {
    for (const cat of conf.categories) {
      for (const e of cat.entries) {
        const truncated = !e.code || e.code.includes(TRUNC_MARK)
        // F2-Gate: Secret-WERT-Pfade (SSOT @shared/secret-class) nur mit content
        // exportieren, wenn der code sichtbar maskiert ist (•••). Sonst kein content.
        const secretClass = isSecretPathForWrite(e.path)
        const masked = !!e.code && e.code.includes(MASK_MARK)
        const exportContent = !truncated && (!secretClass || masked)
        out.push({
          llm,
          cat: cat.id,
          status: e.status,
          path: e.path,
          name: e.name,
          writable: exportContent,
          ...(exportContent ? { content: e.code } : {})
        })
      }
    }
  }
  return out
}

function buildBundle(payload: ExportPayload): ExportBundle {
  const meta = fullBundleReportMetadata()
  return {
    app: meta.app,
    version: meta.version,
    exported: new Date().toISOString(),
    config: payload.config,
    system: payload.system,
    watcher: payload.watcher,
    entries: collectEntries(payload.config)
  }
}

function buildFilteredBundle(payload: ExportPayload, filter: string, entries: ExportEntry[]): ExportBundle {
  const meta = conflictBundleReportMetadata()
  return { ...buildBundle(payload), filter: meta.filter ?? filter, entries }
}

function triggerDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// Reines Bundle-Objekt (ohne Download) — fuer Tests/Re-Import-Roundtrip.
export function buildExportBundle(payload: ExportPayload): ExportBundle {
  return buildBundle(payload)
}

export function exportBundle(payload: ExportPayload): void {
  const bundle = buildBundle(payload)
  const json = JSON.stringify(bundle, null, 2)
  triggerDownload(json, fullBundleFilename(bundle.exported))
}

export function buildConflictExportBundle(payload: ExportPayload): ExportBundle {
  const conflicts = collectEntries(payload.config).filter((e) => e.status === 'conflict')
  return buildFilteredBundle(payload, 'conflicts', conflicts)
}

export function exportConflictBundle(payload: ExportPayload): number {
  const bundle = buildConflictExportBundle(payload)
  const json = JSON.stringify(bundle, null, 2)
  triggerDownload(json, conflictBundleFilename(bundle.exported))
  return bundle.entries.length
}
