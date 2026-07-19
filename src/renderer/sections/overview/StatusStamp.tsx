import { msg } from '../../lib/messages'
import './StatusStamp.css'

// Zustands-Stempel (Teilplan F-WP2d D2, Schaerfung „Kontrollbuch" Regel a):
// einziges emotionales Zentrum oben auf der Startseite. Konturiert, leicht
// rotiert, kein Schatten, hoechstens 8%-Tint-Fuellung. Der Text folgt dem
// echten offenen Zaehler (overview-model warningCount — KEINE Gesamtdifferenz):
// n offene Punkte -> „N DINGE ANSEHEN" (--amber), sonst „ALLES IN ORDNUNG"
// (--sage). role="status" bringt aria-live="polite" implizit mit.
interface StatusStampProps {
  openCount: number
}

export function StatusStamp({ openCount }: StatusStampProps) {
  const allClear = openCount <= 0
  return (
    <p className={'status-stamp ' + (allClear ? 'ok' : 'attention')} role="status">
      {allClear ? msg('overview.stamp.allClear') : msg('overview.stamp.attention', { count: String(openCount) })}
    </p>
  )
}
