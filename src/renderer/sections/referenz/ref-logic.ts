// src/renderer/sections/referenz/ref-logic.ts
// Reine Ableitungs-Funktionen der Referenz-Sektion (HR27-Entlastung der
// Kompositions-Komponente): Versionsstand aus dem Watcher lesen, Changelog-Deltas
// in DriftItem[] uebersetzen, Cross-Tab-Treffer zaehlen, „nutzt du" aus der echten
// Config ableiten. Kein Store-/FS-Zugriff hier (Watcher/Config werden uebergeben),
// keine echten Secret-Werte — nur Namen/Versionen/Kategorien.
import type { RefArtifact, RefDataset } from '@shared/contract-referenz'
import type { LlmConfig, WatcherSource } from '@shared/contract'
import { vcmp } from '@shared/version-compare'

// Re-Export: Konsumenten (DriftBanner) vergleichen mit derselben Semantik.
export { vcmp }

// Eine vorklassifizierte Aenderung fuers „Betrifft dich"-Banner. Lebt hier
// (reines TS-Modul), damit der Test-Runner kein .tsx laden muss; DriftBanner
// importiert type-only von hier.
export interface DriftItem {
  field: string
  kind: string
  note?: string
  // Tri-State: 'yes' = nutzt du (Quelle aktuell), 'uncertain' = genutztes
  // Artefakt, aber Watcher-Quelle veraltet (Luecke evtl. unvollstaendig),
  // 'no' = Artefakt laut echter Config nicht genutzt.
  affects?: 'yes' | 'no' | 'uncertain'
  // Additiv-optional (Index-Konsument): Fundstellen, in denen der Changelog-
  // Schluessel laut echter Config vorkommt (aus searchKeys, NIE Werte). Je
  // Fundstelle Pfad + der konkret gematchte searchKey. Leer/fehlt
  // -> „keine Datei". Nur Pfade/Keys — kein Secret-Wert.
  occurrences?: KeyOccurrence[]
}

// Eine key-genaue Fundstelle: Quelldatei-Pfad + der searchKey, der den
// Delta-Key getroffen hat (Match-Key-Ausweis im Banner, WP25).
export interface KeyOccurrence {
  path: string
  matchedKey: string
}

// Installierte/neueste Version eines Tools — live aus dem Watcher gelesen.
export interface RefVersions {
  installed: string
  latest: string
}

// Passende Watcher-Quelle je LLM finden (Claude Code bzw. Codex).
function sourceFor(sources: WatcherSource[] | undefined, llm: string): WatcherSource | null {
  if (!sources) return null
  const rx = llm === 'codex' ? /codex/i : /claude code/i
  return sources.find((s) => rx.test(s.name)) ?? null
}

// Versionsstand live aus dem Watcher; ohne Treffer null (Banner bleibt ruhig).
export function versionsFromWatcher(
  sources: WatcherSource[] | undefined,
  llm: string,
): RefVersions | null {
  const src = sourceFor(sources, llm)
  if (!src) return null
  return { installed: src.current, latest: src.latest }
}

// Liegt ein Delta in der offenen Luecke installiert < seit <= neueste?
function inGap(since: string, ver: RefVersions): boolean {
  return vcmp(since, ver.installed) > 0 && vcmp(since, ver.latest) <= 0
}

// Delta-art → Scan-Kategorie-ids (Code-Truth: refdata nutzt arts wie 'agent'/
// 'slash'/'settings' bzw. Codex 'config'/'approvals'; der Scan liefert Kategorie-
// ids wie 'agents'/'skills'/'codex-settings'). Leeres Mapping (slash/command/
// vars/env) = im Scan nicht abgebildet -> nie „nutzt du". Unbekannte arts
// fallen auf [art] zurueck (gleichnamige Kategorie).
const ART_CATS: Record<string, string[]> = {
  skill: ['skills'],
  agent: ['agents'],
  hook: ['hooks', 'codex-hooks'],
  settings: ['settings'],
  permissions: ['settings'],
  memory: ['instructions'],
  mcp: ['mcp'],
  command: [],
  slash: [],
  vars: [],
  env: [],
  config: ['codex-settings'],
  approvals: ['codex-settings'],
  agentsmd: ['codex-instructions'],
}

// Nutzt die echte Config das Artefakt hinter einem Delta-art?
export function artUsed(art: string, usedCats: Set<string>): boolean {
  const cats = ART_CATS[art] ?? [art]
  return cats.some((c) => usedCats.has(c))
}

// Ist die Watcher-Quelle des Tools veraltet (nicht 'current')? Ohne Quelle false.
export function sourceIsStale(sources: WatcherSource[] | undefined, llm: string): boolean {
  const src = sourceFor(sources, llm)
  return !!src && src.state !== 'current'
}

// Key-genaues Match-Praedikat (WP25, QUAL-MITTEL-02): Treffer NUR wenn der
// searchKey (a) exakt dem Delta-Key entspricht (case-insensitiv) ODER (b) mit
// '.<Delta-Key>' endet (Punkt-Grenzen-Suffix: searchKey „tools.web_search"
// trifft Delta-Key „web_search"). Die alte breite Tail-Regel (Delta-Key
// „permissions.deny" traf jeden flachen „deny"-searchKey) ist ERSATZLOS
// gestrichen — sie erzeugte belegte False-Positives (ignorePatterns →
// settings.json).
function keyMatches(searchKey: string, want: string): boolean {
  const kl = searchKey.toLowerCase()
  return kl === want || kl.endsWith('.' + want)
}

// Owner-Default „kommt vor in": fuer einen Changelog-Schluessel die Fundstellen
// aus der echten Config sammeln — AUSSCHLIESSLICH ueber die extrahierten
// searchKeys (Key-/Strukturseite, NIE Werte). Match key-genau via keyMatches;
// je Fundstelle wird der ERSTE matchende searchKey ausgewiesen (matchedKey),
// Dedupe ueber den Pfad. cats (art-Scoping, WP25): nicht-leeres Array -> nur
// Kategorien mit passender id; leeres Array (z.B. art 'slash' aus ART_CATS) ->
// sofort []; undefined -> alle Kategorien (Rueckwaertskompatibilitaet). Leeres
// Ergebnis = der Key kommt in KEINER Datei vor -> der Renderer zeigt
// automatisch „keine Datei" (kein kuratiertes Flag).
export function occurrencesFor(
  deltaKey: string,
  cfg: LlmConfig | undefined,
  cats?: string[],
): KeyOccurrence[] {
  if (!cfg || !deltaKey) return []
  if (cats && cats.length === 0) return []
  const want = deltaKey.trim().toLowerCase()
  const out: KeyOccurrence[] = []
  const seen = new Set<string>()
  for (const cat of cfg.categories) {
    if (cats && !cats.includes(cat.id)) continue
    for (const e of cat.entries) {
      const keys = e.searchKeys
      if (!keys || keys.length === 0) continue
      const matched = keys.find((k) => keyMatches(k, want))
      if (matched !== undefined && !seen.has(e.path)) {
        seen.add(e.path)
        out.push({ path: e.path, matchedKey: matched })
      }
    }
  }
  return out
}

// Changelog-Deltas → DriftItem[] fuer das „Betrifft dich"-Banner.
// Nur Deltas in DEINER Versionsluecke (installiert < seit <= neueste, live aus dem
// Watcher) erscheinen ueberhaupt; das statische outOfGap-Flag wird bewusst NICHT
// genutzt. affects ist tri-state: genutztes Artefakt -> 'yes', bei staler Quelle
// 'uncertain' (NIE pauschal alles als betroffen markieren), sonst 'no'.
// Ohne Watcher-Versionen leeres, ruhiges Banner. cfg (additiv-optional): fuellt
// „kommt vor in" (occurrences); fehlt cfg, zeigt der Banner „keine Datei".
export function driftItems(
  dataset: RefDataset,
  ver: RefVersions | null,
  sources: WatcherSource[] | undefined,
  llm: string,
  used: Set<string>,
  cfg?: LlmConfig,
): DriftItem[] {
  const cl = dataset.changelog
  if (!cl || !ver) return []
  const stale = sourceIsStale(sources, llm)
  return cl.deltas
    .filter((d) => inGap(d.since, ver))
    .map((d): DriftItem => {
      const mine = artUsed(d.art, used)
      // Fundstellen art-gescoped (ART_CATS, WP25) fuer Original-Key UND (bei
      // Umbenennung) Ziel-Key; Dedupe ueber path + '|' + matchedKey.
      const cats = ART_CATS[d.art]
      const occ = occurrencesFor(d.key, cfg, cats)
      if (d.to) {
        const ids = new Set(occ.map((o) => o.path + '|' + o.matchedKey))
        for (const o of occurrencesFor(d.to, cfg, cats)) {
          if (!ids.has(o.path + '|' + o.matchedKey)) occ.push(o)
        }
      }
      return {
        field: d.to ? `${d.key} → ${d.to}` : d.key,
        kind: d.kind,
        note: d.note,
        affects: mine ? (stale ? 'uncertain' : 'yes') : 'no',
        occurrences: occ,
      }
    })
}

// Durchsuchbarer Text eines Artefakts (Felder + Intro + Events + Vars), lowercase.
function artifactText(a: RefArtifact): string {
  const fields = a.fields
    .map((f) => `${f.key} ${f.what} ${f.when ?? ''} ${f.safe ?? ''} ${f.example ?? ''} ${f.pitfall ?? ''}`)
    .join(' ')
  const extra = [...(a.events ?? []), ...(a.vars ?? [])]
    .map((x) => ('key' in x ? `${x.key} ${x.desc}` : `${x.token} ${x.desc}`))
    .join(' ')
  return `${a.intro ?? ''} ${fields} ${extra}`.toLowerCase()
}

// Treffer pro Artefakt: ohne Query = Feldanzahl (Entdeckung), mit Query = Anzahl
// passender Felder (+1 falls nur Intro/Events/Vars matchen, damit der Tab sichtbar bleibt).
export function countsByArtifact(arts: RefArtifact[], query: string): Record<string, number> {
  const ql = query.trim().toLowerCase()
  const m: Record<string, number> = {}
  for (const a of arts) {
    if (!ql) {
      m[a.id] = a.fields.length
      continue
    }
    const fieldHits = a.fields.filter((f) => fieldMatches(f, ql)).length
    m[a.id] = fieldHits > 0 ? fieldHits : artifactText(a).includes(ql) ? 1 : 0
  }
  return m
}

// Passt ein Feld auf den (bereits lowercase) Query?
export function fieldMatches(
  f: RefArtifact['fields'][number],
  ql: string,
): boolean {
  if (!ql) return true
  const t = `${f.key} ${f.what} ${f.when ?? ''} ${f.safe ?? ''} ${f.example ?? ''} ${f.pitfall ?? ''}`
  return t.toLowerCase().includes(ql)
}

// „nutzt du": Set der Artefakt-ids, fuer die in der echten Config Eintraege liegen.
// Heuristik wie im Prototyp: Kategorie-id ODER -Label enthaelt die Artefakt-id und
// hat mindestens einen Eintrag. Fehlt die Config, leeres Set (Markierung still aus).
export function usedArtifacts(cfg: LlmConfig | undefined): Set<string> {
  const used = new Set<string>()
  if (!cfg) return used
  for (const cat of cfg.categories) {
    if (cat.entries.length === 0) continue
    used.add(cat.id)
  }
  return used
}
