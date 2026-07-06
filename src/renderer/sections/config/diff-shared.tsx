import { Icon } from '../../components/Icon'
import type { DiffLabels, DiffLine } from '@shared/contract'
import { SEITE, TAG } from '@shared/dup-labels'
import { DIFF_MAX_LINES, DIFF_OVERSIZE_PREFIX } from '@shared/diff-limits'

// Gemeinsame, read-only Diff-Bausteine fuer DiffView (Einzeldatei) und
// DirDiffView (Ordner-Dublette). Aus DiffView.tsx extrahiert (DRY): fetchContent,
// buildFallbackLines, DiffColumn + Helper. Reine Anzeige — keine Mutation, kein
// Schreiben. fetchContent/fetchContentFull sind bridge- und secret-guarded
// (readFull, NIEMALS reveal:true); null -> Platzhalter, niemals Stacktrace oder
// Secret-Wert. Bei masked-Response wird der Inhalt maskiert (•••) gerendert und
// per Badge sichtbar gemacht — Roh-SHA-Verdict bleibt die Vergleichswahrheit.

// Sichtbare Texte aus dem zentralen Sprach-Anker (@shared/dup-labels, Keystone):
// „Shared — zentrale Version" / „Claude — deine Kopie". Verbotene Begriffe
// (Trunk/Mirror) tauchen NICHT mehr in sichtbaren Strings auf. Spalten-Tags
// (TAG.quelle/TAG.lokal) kommen ebenfalls aus dem zentralen Sprach-Anker.
export const FALLBACK_LABELS: DiffLabels = {
  trunk: SEITE.shared,
  mirror: SEITE.claude,
  trunkTag: TAG.quelle,
  mirrorTag: TAG.lokal
}

// Zeilen-Diff via LCS (DP, gleiche Logik wie diff-lines.ts im Main-Prozess).
// Wird aufgerufen wenn kein Scanner-Diff vorliegt (Ordner-Drilldown oder Path
// nicht aufloesbar). DIFF_MAX_LINES aus shared/diff-limits.ts schuetzt vor grossen
// LCS-Matrizen — identisch mit der Main-Grenze (kein Limit-Drift mehr).

function normLines(s: string): string[] {
  if (s === '') return []
  const n = s.replace(/\r\n?/g, '\n')
  const p = n.split('\n')
  if (p.length > 0 && p[p.length - 1] === '') p.pop()
  return p
}

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  return dp
}

function lcsWalk(a: string[], b: string[], dp: number[][]): DiffLine[] {
  const out: DiffLine[] = []
  let i = 0; let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ l: a[i], t: 'ctx', both: true }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ l: a[i], t: 'del', trunkOnly: true }); i++ }
    else { out.push({ l: b[j], t: 'add', mirrorOnly: true }); j++ }
  }
  while (i < a.length) out.push({ l: a[i++], t: 'del', trunkOnly: true })
  while (j < b.length) out.push({ l: b[j++], t: 'add', mirrorOnly: true })
  return out
}

export function buildFallbackLines(trunkText: string, mirrorText: string): DiffLine[] {
  const ta = normLines(trunkText)
  const ma = normLines(mirrorText)
  if (ta.length === 0 && ma.length === 0) return []
  const over = ta.length > DIFF_MAX_LINES || ma.length > DIFF_MAX_LINES
  if (!over) return lcsWalk(ta, ma, lcsMatrix(ta, ma))
  // Kapp-Verhalten: ersten DIFF_MAX_LINES Zeilen je Seite vergleichen + Hinweis voranstellen.
  const ca = ta.slice(0, DIFF_MAX_LINES)
  const cb = ma.slice(0, DIFF_MAX_LINES)
  const note: DiffLine = {
    l: `${DIFF_OVERSIZE_PREFIX} Trunk ${ta.length} Zeilen, Mirror ${ma.length} Zeilen — Vergleich der ersten ${DIFF_MAX_LINES} Zeilen je Seite`,
    t: 'ctx',
    both: true
  }
  return [note, ...lcsWalk(ca, cb, lcsMatrix(ca, cb))]
}

// Inhalt + Maskierungs-Metadaten aus readFull. content ist bei masked=true bereits
// maskiert (•••), getragen wird NIE ein Roh-Secret. masked steuert nur das Badge.
export interface FetchedContent {
  content: string
  masked: boolean
  maskedCount: number
}

// Pfad sicher per readFull laden (NIE reveal); null wenn Bridge fehlt oder
// Secret-Guard greift. Liefert content + masked-Flag, damit die Anzeige ein
// Hinweis-Badge setzen kann. Roher Secret-Wert verlaesst den Main-Prozess nie.
export async function fetchContentFull(path: string): Promise<FetchedContent | null> {
  if (!path || typeof window === 'undefined' || !window.electronAPI?.readFull) return null
  try {
    const res = await window.electronAPI.readFull({ path })
    if (res.error || !res.data) return null
    return {
      content: res.data.content,
      masked: res.data.masked === true,
      maskedCount: res.data.maskedCount ?? 0
    }
  } catch {
    return null
  }
}

// Schmale Variante (nur Inhalt) fuer Aufrufer ohne Masken-Badge-Bedarf.
export async function fetchContent(path: string): Promise<string | null> {
  const r = await fetchContentFull(path)
  return r ? r.content : null
}

// Sichtbarer Hinweis: Inhalt enthaelt maskierte Secret-Stellen (•••). Kein Wert,
// kein Reveal-Knopf — die Anzeige bleibt bewusst maskiert.
export function MaskedBadge({ count }: { count?: number }) {
  return (
    <span className="diff-masked-badge" title="Secret-Stellen sind maskiert (•••) — kein Klartext.">
      {Icon.key}
      maskiert{count && count > 0 ? ` (${count})` : ''}
    </span>
  )
}

// Sichtbarer Hinweis: Voll-Diff wurde wegen Groesse gekappt (kein stiller Schnitt).
export function OversizeHint() {
  return (
    <div className="diff-oversize">
      {Icon.note}
      Datei zu gross fuer den Voll-Diff — Vergleich gekappt (Roh-Hash bleibt maßgeblich).
    </div>
  )
}

// True, wenn buildFallbackLines wegen Groesse gekappt hat (Marker-Zeile vorangestellt).
export function isOversizeFallback(lines: DiffLine[]): boolean {
  return lines.length > 0 && lines[0].both === true && lines[0].l.startsWith(DIFF_OVERSIZE_PREFIX)
}

export function diffSign(line: DiffLine, side: 'trunk' | 'mirror'): string {
  if (side === 'trunk' && line.trunkOnly) return line.t === 'del' ? '−' : '+'
  if (side === 'mirror' && line.mirrorOnly) return line.t === 'add' ? '+' : '−'
  return ''
}

export function diffCls(line: DiffLine, side: 'trunk' | 'mirror'): string {
  if (side === 'trunk' && line.trunkOnly) return ' ' + line.t
  if (side === 'mirror' && line.mirrorOnly) return ' ' + line.t
  return ' ctx'
}

// Eine Seite des Side-by-side-Diff. side filtert die jeweils relevanten Zeilen.
// Nutzt die vorhandene Farbcodierung aus components.css (.dline.add/.del).
export function DiffColumn({
  side,
  head,
  tag,
  path,
  lines
}: {
  side: 'trunk' | 'mirror'
  head: string
  tag: string
  path: string
  lines: DiffLine[]
}) {
  const own = lines.filter((line) => (side === 'trunk' ? !line.mirrorOnly : !line.trunkOnly))
  return (
    <div className={'diff-col ' + side}>
      <div className="diff-col-head">
        {head}
        <span className="dc-path">{path}</span>
        <span className="dc-tag">{tag}</span>
      </div>
      <div className="diff-body">
        {own.map((line, i) => (
          <div className={'dline' + diffCls(line, side)} key={i}>
            <span className="dgut">{diffSign(line, side)}</span>
            {line.l}
          </div>
        ))}
      </div>
    </div>
  )
}
