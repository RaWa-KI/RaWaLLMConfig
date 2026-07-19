import { Icon } from './Icon'

// Zugaenglicher Lade-Fallback fuer lazy geladene Sektionen/Views (Teilplan C).
// role="status" meldet die Ladeanzeige implizit per aria-live="polite" an
// Screenreader. Nutzt die vorhandene .empty-Optik, kein eigenes Styling.
export function SectionFallback({ label = 'Bereich wird geladen …' }: { label?: string }) {
  return (
    <div className="empty" role="status">
      {Icon.refresh}
      <p>{label}</p>
    </div>
  )
}
