// claude-scan-instructions.ts — Instructions-Sammler fuer claude-scan (F6-Split,
// claude-scan.ts war >300 Z). Sammelt ALLE CLAUDE.md ueber alle Ebenen: global
// ~/.claude/CLAUDE.md + je Workspace <ws>/CLAUDE.md UND <ws>/.claude/CLAUDE.md
// (Vergleichszweck). Read-only; CLAUDE.md ist keine Secret-Klasse. Pfade werden
// dedupliziert. NIE Secret-Werte.
import path from 'node:path'
import type { ConfigEntry } from '@shared/contract'
import { workspaceRoots } from '../services/config-roots'
import { buildPreview, firstContentLine } from './scan-helpers'
import type { FileSnapshot } from './file-read-once'
import { readFileOnce } from './file-read-once'
import { extractSearchKeysFromText } from './content-index'

// Eine CLAUDE.md als Instructions-Entry bauen. scope/origin machen den Ursprung
// im Vergleich sichtbar. Default-Status active. WP16: arbeitet auf dem GENAU
// EINMAL gelesenen FileSnapshot (kein readTextSafe/readPreview/stat-Trio mehr).
function claudeMdEntry(id: string, fp: string, snap: FileSnapshot, scope: ConfigEntry['scope'], origin: string, fallbackDesc: string): ConfigEntry {
  const text = snap.text
  const desc = (text ? firstContentLine(text) : '') || fallbackDesc
  const fields: Record<string, string> = { ursprung: origin }
  if (text) fields.zeilen = String(text.split('\n').length)
  if (snap.sizeKb) fields.groesse = snap.sizeKb
  const searchKeys = extractSearchKeysFromText(fp, text)
  return {
    id, name: 'CLAUDE.md', status: 'active', scope, path: fp,
    desc, updated: snap.mtimeIso, fields,
    code: text !== undefined ? buildPreview(text, 45, 1800) : undefined, origin,
    ...(searchKeys.length ? { searchKeys } : {}),
  }
}

/**
 * Alle CLAUDE.md sammeln (F6): global ~/.claude/CLAUDE.md + je registriertem
 * Workspace <ws>/CLAUDE.md UND <ws>/.claude/CLAUDE.md. Pfade dedupliziert
 * (z.B. wenn der eigene WS-Root unter dem Projekte-Parent als WS auftaucht).
 */
export function collectClaudeMds(claudeDir: string): ConfigEntry[] {
  const out: ConfigEntry[] = []
  const seen = new Set<string>()
  const add = (id: string, fp: string, scope: ConfigEntry['scope'], origin: string, fb: string): void => {
    const key = fp.toLowerCase()
    if (seen.has(key)) return
    // WP16: readFileOnce ersetzt existsSync + Read-Trio — snap null = Datei fehlt.
    const snap = readFileOnce(fp)
    if (!snap) return
    seen.add(key)
    out.push(claudeMdEntry(id, fp, snap, scope, origin, fb))
  }
  add('instr-claude-md', path.join(claudeDir, 'CLAUDE.md'), 'global', '~/.claude', 'Globale Instruktionen')
  for (const w of workspaceRoots()) {
    const slug = w.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    add(`instr-claude-md-${slug}`, path.join(w.root, 'CLAUDE.md'), 'project', `${w.label} (Root)`, `CLAUDE.md (${w.label})`)
    add(`instr-claude-md-${slug}-dot`, path.join(w.root, '.claude', 'CLAUDE.md'), 'project', `${w.label} (.claude)`, `CLAUDE.md (${w.label}/.claude)`)
  }
  return out
}
