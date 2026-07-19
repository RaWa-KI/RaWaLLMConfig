// Reiner Berechnungskern von useVirtualRows (fensterbasiertes Listen-Windowing).
// Ausgelagert (Teilplan C), damit die DOM-Zeilen-Obergrenze ohne Browser in
// Node-Specs belegt werden kann. Verhalten 1:1 wie zuvor inline im Hook.
export interface VirtualRange {
  start: number
  end: number
}

// Startfenster vor dem ersten Scroll-Event: sichtbare Zeilen + Overscan.
// viewportHeight null = kein Window (SSR/Node) -> volle Liste, wie bisher.
export function initialVirtualRange(
  count: number,
  estimateSize: number,
  overscan: number,
  enabled: boolean,
  viewportHeight: number | null
): VirtualRange {
  if (!enabled || count === 0 || viewportHeight == null) return { start: 0, end: count }
  const visible = Math.ceil(viewportHeight / estimateSize) + overscan
  return { start: 0, end: Math.min(count, visible) }
}

// Fenster aus Scrollposition: top = Scrollversatz der Liste gegen den Viewport
// (negativ geclamppt, entspricht max(0, -rect.top) im Hook).
export function virtualRangeFor(
  top: number,
  viewportHeight: number,
  count: number,
  estimateSize: number,
  overscan: number
): VirtualRange {
  const safeTop = Math.max(0, top)
  const bottom = Math.min(count * estimateSize, safeTop + viewportHeight)
  const start = Math.max(0, Math.floor(safeTop / estimateSize) - overscan)
  const end = Math.min(count, Math.ceil(bottom / estimateSize) + overscan)
  return { start, end }
}
