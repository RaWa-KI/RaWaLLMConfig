// Icon-Set — 1:1 portiert aus _entpackt/claude-config/icons.jsx (window.Icon).
// Schlanke 1.8px-Stroke-Linien, Retro-Look. Read-only, nur Anzeige.
import type { ReactElement, ReactNode } from 'react'

// Gemeinsame SVG-Huelle: stroke 1.8, currentColor, runde Enden.
function I({ d, fill }: { d: ReactNode; fill?: boolean }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      // Default-Groesse als Presentation-Attribut: verliert gegen JEDE CSS-Regel
      // (Kontext-px-Regeln + globales Netz svg{1.1em}) per Spezifitaet, aendert also
      // nichts am normalen Rendering. Wirkt nur als Floor, falls KEIN CSS greift
      // (z.B. stale/kaputter Build) — verhindert strukturell den Chromium-300px-Default.
      width="1em"
      height="1em"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d}
    </svg>
  )
}

export const Icon: Record<string, ReactElement> = {
  skill: <I d={<><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" /></>} />,
  hook: <I d={<><path d="M18 4v6a4 4 0 0 1-4 4H7" /><path d="M11 11l-4 3 4 3" /><circle cx="18" cy="4" r="1.6" /></>} />,
  rule: <I d={<><path d="M5 4h11l3 3v13H5z" /><path d="M9 9h6M9 13h6M9 17h3" /></>} />,
  gear: <I d={<><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>} />,
  agent: <I d={<><rect x="5" y="8" width="14" height="11" rx="2.5" /><path d="M12 5v3M9 13h.01M15 13h.01" /><circle cx="12" cy="4" r="1.4" /></>} />,
  team: <I d={<><circle cx="9" cy="9" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 7a3 3 0 0 1 0 6M16.5 19a5.5 5.5 0 0 0-3-4.9" /></>} />,
  plug: <I d={<><path d="M9 3v6M15 3v6M7 9h10v3a5 5 0 0 1-10 0z" /><path d="M12 17v4" /></>} />,
  api: <I d={<><path d="M8 7l-4 5 4 5M16 7l4 5-4 5M14 5l-4 14" /></>} />,
  search: <I d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>} />,
  server: <I d={<><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><path d="M8 7h.01M8 17h.01" /></>} />,
  check: <I d={<><path d="M5 12l5 5L20 6" /></>} />,
  merge: <I d={<><path d="M7 4v8a4 4 0 0 0 4 4h6" /><path d="M14 12l3 4-3 4" /><circle cx="7" cy="4" r="1.6" /></>} />,
  archive: <I d={<><rect x="3" y="5" width="18" height="4" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>} />,
  x: <I d={<><path d="M6 6l12 12M18 6L6 18" /></>} />,
  chev: <I d={<><path d="M9 6l6 6-6 6" /></>} />,
  note: <I d={<><path d="M4 5h16v10l-4 4H4z" /><path d="M16 19v-4h4" /><path d="M8 9h8M8 13h4" /></>} />,
  snap: <I d={<><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></>} />,
  warn: <I d={<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>} />,
  edit: <I d={<><path d="M14 5l5 5M4 20l1-4 11-11 4 4-11 11z" /></>} />,
  diff: <I d={<><path d="M6 3v18M18 3v18" /><path d="M4 8h4M16 8h4M4 16h4M16 16h4" /></>} />,
  list: <I d={<><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></>} />,
  arrow: <I d={<><path d="M5 12h14M13 6l6 6-6 6" /></>} />,
  plus: <I d={<><path d="M12 5v14M5 12h14" /></>} />,
  trash: <I d={<><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></>} />,
  save: <I d={<><path d="M5 4h12l3 3v13H5z" /><path d="M8 4v5h7M8 20v-6h8v6" /></>} />,
  cpu: <I d={<><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2" /></>} />,
  box: <I d={<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>} />,
  refresh: <I d={<><path d="M20 11a8 8 0 0 0-14-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14 4.5L20 16m0 4v-4h-4" /></>} />,
  up: <I d={<><circle cx="12" cy="12" r="9" /><path d="M12 16V9M9 12l3-3 3 3" /></>} />,
  term: <I d={<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></>} />,
  db: <I d={<><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>} />,
  globe: <I d={<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></>} />,
  layers: <I d={<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>} />,
  // Erweiterungs-Sektionen (WP-H0): Baum=map, Referenz=book, Graph=net.
  map: <I d={<><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>} />,
  book: <I d={<><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" /><path d="M5 16h14M9 4v12" /></>} />,
  net: <I d={<><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="16" cy="18" r="2.2" /><circle cx="7" cy="17" r="2.2" /><path d="M8 8l8-1M8.5 8.5l6.5 8M16 8l-1 8M8 16l6 1.5" /></>} />,
  monitor: <I d={<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>} />,
  key: <I d={<><circle cx="8" cy="12" r="4" /><path d="M11 12h9M17 12v4M20 12v3" /></>} />,
  cube: <I d={<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /></>} />,
  sparkle: <I d={<><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></>} />,
  folder: <I d={<><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>} />
}
