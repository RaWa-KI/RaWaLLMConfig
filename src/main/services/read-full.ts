// read-full.ts — EIN readFull-Kern fuer beide IPC-Pfade (ARCH-MITTEL-01):
// ipc-write.ts (config:readFull, credential:true) und ipc.ts
// (sys:watcherReadFull, credential:false) rufen readFullCore() auf. Damit
// gelten der F8-2-MB-Groessen-Guard und guarded() auch fuer den watcher-Pfad
// (vorher fehlend -> Main-Crash-Risiko bei grossem Pfad). Pipeline:
// req-Validierung -> stat -> isFile -> Size-Guard -> read -> Owner-/Watcher-Ausgabe.
// Liefert NIE rohe Error-Objekte oder Secret-Werte in Fehlern.
import { readFileSync, statSync } from 'node:fs'
import type { ReadFullRequest, ReadFullResult } from '@shared/contract-write'
import { detectCredentials } from './credential-detect'
import { isSecretPathForRead } from './secret-guard'
import { maskSecrets } from './secret-mask'
import { appendAudit, makeAuditEntry } from './audit-log'
import { getWriteContext } from './write-mode'
import { fmtSize } from '../lib/fmt-size'

// Optionen je Aufrufpfad: credential steuert die Credential-Meta (nur der
// config:readFull-Pfad braucht sie — Env-Migrations-Hinweis); auditPath
// erlaubt Tests/Sonderkontexte einen expliziten Audit-Zielpfad (Default:
// Write-Context des Main-Prozesses).
export interface ReadFullCoreOpts {
  credential: boolean
  auditPath?: string
}

// Obergrenze fuer readFull-Anzeige. Echte Text-Config-Dateien (claude.json,
// AGENTS.md, settings.json, ...) sind im KB-Bereich; lokale LLM-Modelle (GGUF)
// sind dagegen mehrere GB gross. readFileSync(..,'utf8') auf so eine Datei
// sprengt das V8-String-Limit bzw. den Heap und crasht den Main-Prozess (F8:
// "Inhalt anzeigen" eines GGUF-Modells). 2 MB ist fuer jede reale Config mehr
// als genug und faengt Binaer-/Modelldateien sicher ab, BEVOR gelesen wird.
export const MAX_READFULL_BYTES = 2 * 1024 * 1024 // 2 MB

// readFullCore: Vollinhalt fuer reine ANZEIGE. Owner-Override-Kern: der
// config:readFull-Pfad (opts.credential=true) liefert in der lokalen Owner-App
// rohen Inhalt ohne Reveal-/Maskier-Gate. Der watcher-Pfad bleibt defensiv
// maskiert; reveal=true bleibt als Rueckwaertskompatibilitaet erhalten und
// schreibt einen wertfreien Audit-Eintrag. Distinkte Fehler bleiben:
// invalid-request / nicht-gefunden / ordner / zu-gross / nicht-lesbar
// (Write-Pfad/assertWritable bleibt unberuehrt).
export function readFullCore(req: ReadFullRequest, opts: ReadFullCoreOpts): ReadFullResult {
  if (!req || typeof req.path !== 'string' || !req.path) {
    return { data: null, error: 'invalid-request' }
  }
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(req.path)
  } catch {
    return { data: null, error: 'nicht-gefunden' }
  }
  if (!stat.isFile()) {
    return { data: null, error: 'ordner' }
  }
  // Groessen-Guard VOR readFileSync: zu grosse Datei (Binaer-/Modelldatei, GGUF)
  // wuerde den Main-Prozess crashen. Klarer Fehler statt Absturz (F8). Die
  // Groesse wird in den Fehlercode kodiert, damit der Renderer sie anzeigen kann.
  if (stat.size > MAX_READFULL_BYTES) {
    return { data: null, error: `zu-gross:${fmtSize(stat.size)}` }
  }
  let raw: string
  try {
    raw = readFileSync(req.path, 'utf8')
  } catch (err) {
    console.error('[read-full]', `readFull: ${err instanceof Error ? err.message : 'fail'}`)
    return { data: null, error: 'nicht-lesbar' }
  }
  return buildResult(req, raw, opts)
}

// Baut das Ergebnis fuer Owner-Editor oder defensive Watcher-Reads.
// detectCredentials laeuft IMMER auf dem ROH-Inhalt (main-seitig, wertfrei),
// aber nur wenn der Aufrufpfad sie braucht (opts.credential — der watcher-Shape
// bleibt unveraendert, ReadFullResultData.credential ist optional).
// reveal===true -> roher Inhalt + Audit-Eintrag (nur Pfad/Aktion, nie Wert).
function buildResult(req: ReadFullRequest, raw: string, opts: ReadFullCoreOpts): ReadFullResult {
  const credential = opts.credential ? detectCredentials(raw, req.path) : undefined
  const isSecret = isSecretPathForRead(req.path)
  if (opts.credential) {
    return { data: { path: req.path, content: raw, credential, masked: false, maskedCount: 0 }, error: null }
  }
  if (isSecret && req.reveal === true) {
    appendAudit(
      makeAuditEntry('readfull-reveal', req.path, 'ok'),
      opts.auditPath ?? getWriteContext().auditPath
    )
    return { data: { path: req.path, content: raw, credential, masked: false, maskedCount: 0 }, error: null }
  }
  if (isSecret) {
    const { masked, maskedCount } = maskSecrets(raw, req.path)
    return { data: { path: req.path, content: masked, credential, masked: true, maskedCount }, error: null }
  }
  return { data: { path: req.path, content: raw, credential, masked: false, maskedCount: 0 }, error: null }
}
