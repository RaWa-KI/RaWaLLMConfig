// prefetch-sections.ts — Idle-Prefetch der Lazy-Chunks (Teilplan F, F-WP2).
// Der perf:ui-Harness (caudex-Budget Kalt-Navigation, hart 300 ms) mass Erst-
// Navigationen inkl. Chunk-Load + Erst-Render im Sekundenbereich. Darum werden
// die Lazy-Sektionen/Views nach dem ersten Commit im Leerlauf importiert —
// fire-and-forget: kein Lade-/Fehlerzustand, kein Drosseln des Startpfads.
// DRIFT-GUARD: die Moduldateien muessen exakt den lazy()-Imports in App.tsx
// bzw. ConfigSection.tsx entsprechen (gleiche Datei = gleicher Chunk = warmer
// Cache-Treffer); die Paritaet pinnt prefetch-displaymode-teil-f.spec.ts.
const LAZY_MODULE_LOADERS: ReadonlyArray<() => Promise<unknown>> = [
  () => import('../sections/updates/UpdatesSection'),
  () => import('../sections/struktur/StrukturSection'),
  () => import('../sections/referenz/ReferenceSection'),
  () => import('../sections/graph/GraphSection'),
  () => import('../sections/baum/TreeSection'),
  () => import('../sections/archiv/ArchivSection'),
  () => import('../sections/onboarding/OnboardingFlow'),
  () => import('../sections/compare/CompareView'),
  () => import('../sections/coverage/CoverageView')
]

interface IdleWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
}

let scheduled = false

// Einmalig einplanen; weitere Aufrufe (Remount/HMR) sind harmlos. Fehler werden
// bewusst verschluckt: der echte Import beim Oeffnen hat sein eigenes Fehler-
// bild (Suspense/SectionFallback) — der Prefetch ist reine Optimierung.
export function scheduleSectionPrefetch(): void {
  if (scheduled || typeof window === 'undefined') return
  scheduled = true
  const prefetch = (): void => {
    for (const load of LAZY_MODULE_LOADERS) void load().catch(() => {})
  }
  const w = window as unknown as IdleWindow
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(prefetch, { timeout: 2_000 })
  else window.setTimeout(prefetch, 1_500)
}
