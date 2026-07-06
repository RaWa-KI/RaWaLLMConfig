// src/renderer/sections/referenz/DriftBanner.tsx
// Praesentational/props-getrieben: zeigt das „Betrifft dich"-Banner mit den
// offenen Changelog-Aenderungen je Feld. KEIN Store-Zugriff hier — die
// Verdrahtung (driftByField/vcmp/Versionsstand aus Watcher) macht ReferenceSection.
import { useState } from 'react'
import { Icon } from '../../components/Icon'
// DriftItem lebt in ref-logic.ts (reines TS-Modul, testbar ohne .tsx-Load);
// hier nur type-only konsumiert. vcmp: gemeinsame Semver-Semantik (@shared).
import { vcmp, type DriftItem, type KeyOccurrence } from './ref-logic'

// Owner-Default: voller Pfad + gematchter Key je Fundstelle (WP25), max 5
// Fundstellen + „+x weitere"; leer -> „keine Datei".
const MAX_OCC = 5
function Occurrences({ occ }: { occ?: KeyOccurrence[] }) {
  if (!occ || occ.length === 0) {
    return <span className="dr-occ none">keine Datei</span>
  }
  const shown = occ.slice(0, MAX_OCC)
  const more = occ.length - shown.length
  return (
    <span className="dr-occ">
      <span className="dr-occ-l">kommt vor in:</span>
      {shown.map((o) => (
        <span className="dr-occ-p mono" key={o.path + '|' + o.matchedKey}>
          {o.path}
          <span className="dr-occ-k">{' · Key: '}{o.matchedKey}</span>
        </span>
      ))}
      {more > 0 && <span className="dr-occ-more">+{more} weitere</span>}
    </span>
  )
}

interface DriftBannerProps {
  items: DriftItem[]
  installed?: string
  latest?: string
  // true = Watcher-Quelle veraltet: „nutzt du" wird als „ungewiss" gezeigt.
  stale?: boolean
}

// Badge-Label + CSS-Klasse je Aenderungs-Art (Deutsch, echte Umlaute).
const KIND: Record<string, [string, string]> = {
  added: ['neu', 'new'],
  deprecated: ['veraltet', 'dep'],
  renamed: ['umbenannt', 'ren'],
  removed: ['entfällt', 'rem'],
  default: ['Default geändert', 'def'],
}

// Eine Zeile in der aufgeklappten Liste.
function DriftRow({ item }: { item: DriftItem }) {
  const [lbl, cls] = KIND[item.kind] || KIND.added
  return (
    <div className="drift-row">
      <span className={'rf-badge ' + cls}>{lbl}</span>
      <span className="dr-key mono">{item.field}</span>
      {item.note && <span className="dr-note">{item.note}</span>}
      {item.affects === 'yes' && (
        <span className="dr-mine">
          {Icon.check}nutzt du
        </span>
      )}
      {item.affects === 'uncertain' && (
        <span className="dr-mine uncertain">ungewiss (Quelle veraltet)</span>
      )}
      <Occurrences occ={item.occurrences} />
    </div>
  )
}

export function DriftBanner({ items, installed, latest, stale }: DriftBannerProps) {
  const [open, setOpen] = useState(false)
  // Semver-Vergleich statt String-Gleichheit: installiert >= neueste = aktuell.
  const upToDate = !latest || !installed || vcmp(installed, latest) >= 0
  const mineCount = items.filter((i) => i.affects === 'yes').length

  return (
    <div className={'drift-banner' + (open ? ' open' : '')}>
      <button className="drift-head" onClick={() => setOpen((o) => !o)} type="button">
        {Icon.refresh}
        <span className="dh-title">Betrifft dich</span>
        {installed && (
          <span className="dh-ver">
            <b>{installed}</b>
            {!upToDate && (
              <>
                {' → '}
                <b>{latest}</b>
              </>
            )}
          </span>
        )}
        <span className="dh-src">aus Watcher</span>
        {stale && <span className="dh-stale">· Quelle veraltet</span>}
        <span className={'dh-count' + (upToDate ? ' ok' : '')}>
          {upToDate ? 'aktuell' : items.length + ' offen'}
          {mineCount ? ' · ' + mineCount + ' nutzt du' : ''}
        </span>
        <span className={'dh-chev' + (open ? ' open' : '')}>{Icon.chev}</span>
      </button>
      {open && (
        <div className="drift-list">
          {items.map((item, i) => (
            <DriftRow item={item} key={item.field + ':' + i} />
          ))}
          <div className="drift-foot">
            {Icon.snap}
            <span>
              Versionsstand <b>live aus dem Watcher</b>. Oben stehen nur Änderungen in deiner
              Versionslücke (installiert → neueste) — „<b>nutzt du</b>" kommt aus deiner echten
              Config. Ist die Watcher-Quelle veraltet, heißt es „<b>ungewiss</b>" statt „nutzt du".
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
