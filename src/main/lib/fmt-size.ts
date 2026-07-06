// fmt-size.ts — Menschenlesbare Byte-Groesse fuer den Main-Layer.
// Vorlage: ipc-write.ts ~Z.103 (ausfuehrlichere Einheitentabelle mit
// units-Array und while-Schleife; llm-scan.ts ~Z.24 nutzt if-Kaskade mit
// gleicher Ausgabe bis GB, kennt aber kein TB). Hier: ipc-write.ts-Variante
// als ausfuehrlichere Vorlage uebernommen (TB-Stufe erhalten). Kein Secret-Inhalt.

/**
 * Bytes menschenlesbar (KB/MB/GB/TB), z.B. "13.3 GB".
 * Vorlage: ipc-write.ts ~Z.103.
 */
export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}
