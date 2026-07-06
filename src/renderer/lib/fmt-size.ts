// fmt-size.ts — Menschenlesbare Byte-Groesse fuer den Renderer-Layer.
// Zwei Vorlagen in Betrieb:
//   A) ArchivList.tsx ~Z.16: kennt n<=0 -> '—', max Stufe MB, Trennzeichen Leerzeichen.
//   B) UpdateManagerPanel.tsx ~Z.15: kein Nullcheck, max Stufe MB, kein Leerzeichen
//      (Wert+Einheit direkt konkateniert mit +).
// Konsolidierte Form: Vorlage A (ausfuehrlicher: Nullcheck + '—', Leerzeichen als
// Trennzeichen). Kein inhaltlicher Unterschied bei gueltigen Werten ausser
// Null-/Leer-Behandlung (Vorlage B liefert '0 B', Vorlage A '—').

/**
 * Bytes menschenlesbar (B/KB/MB), z.B. "13.3 MB".
 * n<=0 oder NaN liefert '—' (kein Inhalt anzuzeigen). Vorlage: ArchivList.tsx.
 */
export function fmtSize(n: number): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
