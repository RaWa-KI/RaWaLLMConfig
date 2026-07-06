import { useEffect, useState } from 'react'
import './PrefsSection.css'
import type { PrefValue } from '@shared/contract-write'
import { Icon } from '../../components/Icon'
import { usePrefs } from '../../state/store-write-prefs'

// PrefsSection — Tweaks/App-Prefs (F-Tweaks). Zeigt die Tweaks an und speichert
// sie via usePrefs() (Main: backup-first + atomar). Persistierter Zustand wird
// sofort sichtbar (auf <html> data-* angewandt = Live-Vorschau). Das Einhaengen
// in App/Navigation ist Welle 3 (Hub WP-INT-06) — hier NICHT.

// Tweak-Optionen spiegeln das Token-System (tokens.css data-theme/-structure/-density).
interface TweakDef {
  key: string
  label: string
  attr: string // <html data-...>; '' = kein Attribut (Default)
  options: { value: string; label: string }[]
}

const TWEAKS: TweakDef[] = [
  {
    key: 'theme', label: 'Farbthema', attr: 'theme',
    options: [
      { value: 'hell', label: 'Hell' }, { value: 'papier', label: 'Papier' },
      { value: 'greige', label: 'Greige' }, { value: 'anthrazit', label: 'Anthrazit' },
      { value: 'espresso', label: 'Espresso' }
    ]
  },
  {
    key: 'structure', label: 'Struktur', attr: 'structure',
    options: [
      { value: 'retro', label: 'Retro' }, { value: 'lines', label: 'Linien' },
      { value: 'emboss', label: 'Emboss' }
    ]
  },
  {
    key: 'density', label: 'Dichte', attr: 'density',
    options: [
      { value: 'airy', label: 'Luftig' }, { value: 'compact', label: 'Kompakt' }
    ]
  }
]

// Prefs auf <html> data-* anwenden (Live-Vorschau). 'hell'/leer = Attribut entfernen.
function applyToHtml(prefs: Record<string, PrefValue>): void {
  if (typeof document === 'undefined') return
  for (const t of TWEAKS) {
    const v = String(prefs[t.key] ?? '')
    if (!v || v === 'hell') document.documentElement.removeAttribute(`data-${t.attr}`)
    else document.documentElement.setAttribute(`data-${t.attr}`, v)
  }
}

function TweakRow({ def, value, onPick }: {
  def: TweakDef
  value: string
  onPick: (v: string) => void
}) {
  return (
    <div className="tweak-row">
      <div className="tweak-label">{def.label}</div>
      <div className="tweak-opts">
        {def.options.map((o) => (
          <button
            key={o.value}
            className={'pill ' + (value === o.value ? 'active' : 'ghost')}
            style={{ cursor: 'pointer' }}
            onClick={() => onPick(o.value)}
          >
            {value === o.value && <span className="pd" />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function usePrefsStoreHint(): string | null {
  const [storeHint, setStoreHint] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function loadStoreHint(): Promise<void> {
      if (typeof window === 'undefined' || !window.electronAPI?.prefsGet) return
      const res = await window.electronAPI.prefsGet()
      if (cancelled || !res.data) return
      setStoreHint(res.data.fallbackReason)
    }
    void loadStoreHint()
    return () => { cancelled = true }
  }, [])
  return storeHint
}

export function PrefsSection() {
  const { prefs, loading, loadError, setPref } = usePrefs()
  const storeHint = usePrefsStoreHint()

  // Persistierten Zustand sichtbar machen (Live-Vorschau), sobald Prefs da sind.
  useEffect(() => { applyToHtml(prefs) }, [prefs])

  return (
    <main className="main" style={{ gridColumn: '1 / -1' }}>
      <div className="view-head">
        <div className="view-title">
          <h2>Tweaks &amp; Einstellungen</h2>
          <p>Optik-Tweaks der App · jede Änderung wird mit Backup gespeichert.</p>
        </div>
      </div>

      {loadError && (
        <div className="card flat">
          <div className="empty" style={{ padding: 20 }}>{loadError}</div>
        </div>
      )}
      {storeHint && (
        <div className="card flat">
          <div className="empty" style={{ padding: 20 }}>{storeHint}</div>
        </div>
      )}

      <div className="card prefs-card">
        <div className="prefs-head">
          <span className="prefs-ic">{Icon.gear}</span>
          <span className="prefs-title">Darstellung</span>
          {loading && <span className="pill ghost">lädt…</span>}
        </div>
        {TWEAKS.map((def) => (
          <TweakRow
            key={def.key}
            def={def}
            value={String(prefs[def.key] ?? '')}
            onPick={(v) => void setPref(def.key, v)}
          />
        ))}
      </div>
    </main>
  )
}
