// drift-relation.ts — Drift-Erkennung (Plan 2026-07-20, WP3): NEUE Gruppierung
// ueber die userglobal-Kategorien. Cross-Scope-Kopien (gleiche normalizeCat-
// Achse + gleicher normalizeKey-Name in >= 2 Provider-Loader-Roots claude/
// codex/agents) werden als DriftRelation erkannt — KEIN DuplicateSet
// (dedupe.ts bleibt unberuehrt). Status same|diff via SHA-256 (hashFile),
// Heuristik liefert nur suggestion:'parity', nie ein decision (Nutzer-Sache).
// Laeuft im Scan (sync-fs ok, kein IPC-Pfad). Alle fs-Zugriffe in try/catch.
import path from 'node:path'
import type { LlmConfig } from '@shared/contract'
import type { DriftDecisionRecord, DriftMember, DriftRelation, DriftRootKind } from '@shared/contract-drift'
import { driftRelationKey } from '@shared/contract-drift'
import { normalizeCat, normalizeKey } from '@shared/cat-key'
import { isPathEqualOrUnder } from '@shared/path-compare'
import { hashFile } from './dedupe-fs'
import { createDriftRelationStore } from './drift-relation-store'
import { configRoots } from './config-roots'

// Injizierbare Decision-Quelle (Muster: findDriftRelations-Store-Dep).
export type DriftDecisionSource = Pick<ReturnType<typeof createDriftRelationStore>, 'readDecisions'>

// Root-Art aus dem Kategorie-Praefix (VOR normalizeCat pruefen).
// 'agents' = ~/.agents-Loader, 'kimi' = ~/.kimi-code-Loader (WP-8, B9).
const ROOT_RX = /^userglobal-(claude|codex|agents|kimi)-/

interface Candidate {
  cat: string
  name: string
  path: string
  updated?: string
  rootKind: DriftRootKind
}

function rootKindOf(catId: string): DriftRootKind | null {
  const match = ROOT_RX.exec(catId ?? '')
  return match ? (match[1] as DriftRootKind) : null
}

/** Sammelt userglobal-Eintraege aller Familien nach normalizeCat|normalizeKey. */
function collectCandidates(data: Record<string, LlmConfig>): Map<string, Candidate[]> {
  const groups = new Map<string, Candidate[]>()
  for (const cfg of Object.values(data)) {
    for (const cat of cfg?.categories ?? []) {
      const rootKind = rootKindOf(cat.id)
      if (!rootKind) continue
      for (const entry of cat.entries ?? []) {
        const name = normalizeKey(entry.name)
        if (!name || !entry.path) continue
        const key = `${normalizeCat(cat.id)}|${name}`
        const list = groups.get(key) ?? []
        list.push({ cat: cat.id, name: entry.name, path: entry.path, updated: entry.updated, rootKind })
        groups.set(key, list)
      }
    }
  }
  return groups
}

/** Baut eine DriftRelation aus einer Gruppe; null bei < 2 Mitgliedern/Roots. */
function toRelation(cands: Candidate[]): DriftRelation | null {
  if (cands.length < 2) return null
  if (new Set(cands.map((c) => c.rootKind)).size < 2) return null
  const members: DriftMember[] = cands.map((c) => ({
    path: c.path,
    rootKind: c.rootKind,
    updated: c.updated,
    sha256: hashFile(c.path) ?? undefined,
  }))
  const hashes = members.map((m) => m.sha256)
  const status = hashes.every((h) => h != null && h === hashes[0]) ? 'same' : 'diff'
  return { cat: normalizeCat(cands[0].cat), name: cands[0].name, members, status, suggestion: 'parity' }
}

/** Persistierte Nutzer-Festlegungen auf die Relationen anwenden (in-place). */
function applyDecisions(relations: DriftRelation[], records: DriftDecisionRecord[]): void {
  const byKey = new Map(records.map((r) => [r.key, r]))
  for (const rel of relations) {
    const rec = byKey.get(driftRelationKey(rel.cat, rel.name, rel.members.map((m) => m.rootKind)))
    if (rec) {
      rel.decision = rec.decision
      rel.decidedAt = rec.decidedAt
    }
  }
}

/** Fuellt data.userglobal.driftRelations in-place. Mutiert data. */
export function findDriftRelations(
  data: Record<string, LlmConfig>,
  store: Pick<ReturnType<typeof createDriftRelationStore>, 'readDecisions'> = createDriftRelationStore()
): void {
  try {
    const relations: DriftRelation[] = []
    for (const cands of collectCandidates(data).values()) {
      const rel = toRelation(cands)
      if (rel) relations.push(rel)
    }
    applyDecisions(relations, store.readDecisions())
    if (data.userglobal) data.userglobal.driftRelations = relations
  } catch (err) {
    console.error('[scan:drift]', err instanceof Error ? err.message : 'unbekannt')
    if (data.userglobal && !Array.isArray(data.userglobal.driftRelations)) {
      data.userglobal.driftRelations = []
    }
  }
}

/**
 * Loader-Root-Art eines realen Pfads — Pfad-Pendant zur ROOT_RX-Logik
 * (Kategorie-Praefixe): ~/.claude -> claude, ~/.codex -> codex,
 * ~/.agents -> agents, ~/.kimi-code -> kimi. Sandbox-aware: die Wurzeln
 * kommen aus configRoots(), .agents/.kimi-code liegen als Geschwister von
 * claudeHome (gleiche Ableitung wie scan-userglobal/kimi-cats). Nutzer-
 * Zusatzquellen, die in einen dieser Baeume zeigen, werden so korrekt
 * normalisiert; fremde Pfade liefern null.
 */
function rootKindForPath(absPath: string): DriftRootKind | null {
  const roots = configRoots()
  const home = path.dirname(roots.claudeHome)
  const candidates: Array<[DriftRootKind, string]> = [
    ['claude', roots.claudeHome],
    ['codex', roots.codexHome],
    ['agents', path.join(home, '.agents')],
    ['kimi', path.join(home, '.kimi-code')],
  ]
  for (const [kind, root] of candidates) {
    if (isPathEqualOrUnder(absPath, root, process.platform)) return kind
  }
  return null
}

/**
 * Drift-Decision-Key eines Pfad-Paars (z. B. trunk/mirror eines
 * DuplicateSet): Root-Arten aus den Pfaden ableiten und denselben
 * driftRelationKey bauen wie die Drift-Sicht. null, wenn das Paar nicht
 * eindeutig Cross-Root zuordenbar ist — dann bleibt das Set unangetastet.
 */
export function driftDecisionKeyForPaths(cat: string, name: string, paths: string[]): string | null {
  const kinds = paths.map(rootKindForPath).filter((k): k is DriftRootKind => k !== null)
  if (kinds.length < 2 || new Set(kinds).size < 2) return null
  return driftRelationKey(cat, name, kinds)
}
