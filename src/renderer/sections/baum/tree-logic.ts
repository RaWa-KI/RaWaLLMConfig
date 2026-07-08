// Reine Baum-Logik (WP-C1): Gruppierung nach Ebene + ehrliche Marker-Ableitung
// aus VORHANDENEN ConfigEntry-Feldern. KEIN pointsTo (gibt es nicht). Read-only,
// kein FS, keine Secret-Werte — nur Namen/Pfade/Status.
import type { Category, ConfigEntry, Scope } from '@shared/contract'

// Ebenen-Reihenfolge (oben→unten) + sichtbare deutsche Labels.
export interface ScopeDef {
  id: Scope
  label: string
  icon: string
}
export const SCOPES: ReadonlyArray<ScopeDef> = [
  { id: 'managed', label: 'Managed', icon: 'rule' },
  { id: 'global', label: 'Persönlich · Claude/Codex/Agents', icon: 'globe' },
  { id: 'project', label: 'Projekt', icon: 'box' },
  { id: 'local', label: 'Lokal', icon: 'monitor' },
  { id: 'shared', label: 'Geteilt · Cross-WS', icon: 'team' }
]

// Ein Blatt mit Herkunfts-Kategorie (fuer Icon/Folder-Anzeige).
export interface Leaf {
  cat: Category
  e: ConfigEntry
}

// Kontext aller abgeleiteten Marker-Sets (einmal pro Render gebaut).
export interface MarkerCtx {
  cascade: Map<string, Set<Scope>>
  sameLevelDup: Set<string>
}

// Schluessel pro (Kategorie, Name) ueber alle Ebenen — fuer Kaskade.
function keyCat(c: Category, e: ConfigEntry): string {
  return c.id + '::' + e.name
}

// Entries je Ebene; archivierte werden nicht im Baum gezeigt.
export function byScope(cats: Category[]): Record<Scope, Leaf[]> {
  const m = { managed: [], global: [], project: [], local: [], shared: [] } as Record<Scope, Leaf[]>
  cats.forEach((c) =>
    c.entries.forEach((e) => {
      if (e.status === 'archived') return
      m[e.scope].push({ cat: c, e })
    })
  )
  return m
}

// Kaskade: gleicher (Kategorie,Name) auf MEHREREN Ebenen (Override-Kette).
export function cascadeNames(cats: Category[]): Map<string, Set<Scope>> {
  const m = new Map<string, Set<Scope>>()
  cats.forEach((c) =>
    c.entries.forEach((e) => {
      if (e.status === 'archived') return
      const k = keyCat(c, e)
      const set = m.get(k) ?? new Set<Scope>()
      set.add(e.scope)
      m.set(k, set)
    })
  )
  return m
}

// Fehl-Dublette: gleicher (Ebene,Kategorie,Name) ZWEIMAL — Anomalie. Liefert Set
// der betroffenen Entry-IDs (beide Vorkommen markiert).
export function sameLevelDup(cats: Category[]): Set<string> {
  const seen = new Map<string, string>()
  const flag = new Set<string>()
  cats.forEach((c) =>
    c.entries.forEach((e) => {
      if (e.status === 'archived') return
      const k = e.scope + '::' + keyCat(c, e)
      const prev = seen.get(k)
      if (prev) {
        flag.add(prev)
        flag.add(e.id)
      } else seen.set(k, e.id)
    })
  )
  return flag
}

// Wie viele Ebenen trägt diese Einheit (>=1).
export function cascadeN(cat: Category, e: ConfigEntry, ctx: MarkerCtx): number {
  return ctx.cascade.get(keyCat(cat, e))?.size ?? 1
}

// Abgeleitete Marker eines Blatts. „Verweis" nur, wenn `origin` auf eine FREMDE
// Ebene zeigt (ehrlich aus Daten); sonst weggelassen statt erfunden.
export interface Markers {
  cascade: number // >1 = Kaskaden-Marker
  copy: boolean // dupOf gesetzt oder status 'dup'
  ref: boolean // origin verweist auf andere Ebene
  fehlDup: boolean // gleicher Name doppelt auf derselben Ebene
}
export function markersFor(cat: Category, e: ConfigEntry, ctx: MarkerCtx): Markers {
  return {
    cascade: cascadeN(cat, e, ctx),
    copy: !!e.dupOf || e.status === 'dup',
    ref: originIsForeign(e),
    fehlDup: ctx.sameLevelDup.has(e.id)
  }
}

// origin nennt eine andere Ebene als die, auf der der Eintrag liegt? (heuristisch,
// nur aus dem sprechenden Text — KEINE FS-Aufloesung).
function originIsForeign(e: ConfigEntry): boolean {
  const o = e.origin?.toLowerCase().trim()
  if (!o) return false
  const here: Record<Scope, string[]> = {
    managed: ['managed'],
    global: ['~/.claude', '.codex', 'global', 'userglobal'],
    project: ['projekt', 'project', '<projekt>'],
    local: ['lokal', 'local', 'gitignored'],
    shared: ['.shared', 'shared', 'geteilt', 'cross-ws']
  }
  return !here[e.scope].some((tok) => o.includes(tok))
}

// Ein Blatt ist „auffaellig", wenn mindestens ein Marker zieht.
export function isFlagged(cat: Category, e: ConfigEntry, ctx: MarkerCtx): boolean {
  const m = markersFor(cat, e, ctx)
  return m.cascade > 1 || m.copy || m.ref || m.fehlDup
}
