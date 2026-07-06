// version-compare.ts — gemeinsamer Semver-Vergleich für Main (watcher-live) +
// Renderer (ref-logic). vparse/vcmp 1:1 aus ref-logic.ts übernommen (WP9):
// 3 Segmente, fehlende Stellen = 0, parseInt||0 toleriert Tag-Suffixe wie
// `2026-06-04-hooks`. Verhalten NICHT ändern — beide Seiten müssen identisch
// vergleichen.

function vparse(v: string): number[] {
  return (v || '').split('.').map((n) => parseInt(n, 10) || 0)
}

export function vcmp(a: string, b: string): number {
  const x = vparse(a)
  const y = vparse(b)
  for (let i = 0; i < 3; i++) {
    const d = (x[i] || 0) - (y[i] || 0)
    if (d !== 0) return d
  }
  return 0
}
