import { useEffect, useState } from 'react'
import './PrefsSection.css'
import type { PrefValue } from '@shared/contract-write'
import { SUPPORTED_LOCALES } from '@shared/messages'
import { languagePackHint, prefsStoreHint, settingsExpertList } from '@shared/messages/ux-copy'
import { Icon } from '../../components/Icon'
import { msg, msgText } from '../../lib/messages'
import { useLocale } from '../../state/store-locale'
import { useStore } from '../../state/store'
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

function LanguageRow() {
  const { locale, setAppLocale } = useLocale()
  return (
    <div className="tweak-row">
      <div className="tweak-label">{msg('settings.language.label')}</div>
      <div className="tweak-opts">
        {SUPPORTED_LOCALES.map((option) => (
          <button
            key={option.code}
            type="button"
            className={'pill ' + (locale === option.code ? 'active' : 'ghost')}
            onClick={() => void setAppLocale(option.code)}
          >
            {locale === option.code && <span className="pd" />}
            {msgText(option.labelKey)}
          </button>
        ))}
      </div>
      <p className="tweak-help">{languagePackHint()}</p>
    </div>
  )
}

function StoreHintCard({ reason, expert }: { reason: string; expert: boolean }) {
  const hint = prefsStoreHint()
  return (
    <div className="card flat prefs-store-hint">
      <b>{hint.title}</b>
      <p>{hint.body}</p>
      <p>{hint.action}</p>
      {expert && (
        <div className="prefs-technical-reason">
          <b>Technischer Grund</b>
          <code>{reason}</code>
        </div>
      )}
    </div>
  )
}

function SettingsExpertCard() {
  const items = settingsExpertList()
  return (
    <div className="card flat prefs-expert-details">
      <b>{msg('expertDetails.rawDetails')}</b>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

function BackupPathRow({ value, onPick, onReset }: {
  value: string
  onPick: () => void
  onReset: () => void
}) {
  return (
    <div className="backup-row">
      <div>
        <div className="tweak-label">Backup-Ordner</div>
        <code className="backup-path">{value || 'Standardpfad der App'}</code>
      </div>
      <div className="backup-actions">
        <button type="button" className="pill ghost" onClick={onPick}>{Icon.folder} Wählen</button>
        {value && <button type="button" className="pill ghost" onClick={onReset}>Standard</button>}
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
  const { ui } = useStore()

  // Persistierten Zustand sichtbar machen (Live-Vorschau), sobald Prefs da sind.
  useEffect(() => { applyToHtml(prefs) }, [prefs])

  async function pickArchiveRoot(): Promise<void> {
    const res = await window.electronAPI?.pickFolder()
    if (!res?.data) return
    await setPref('archiveRoot', res.data)
  }

  return (
    <main className="main" style={{ gridColumn: '1 / -1' }}>
      <div className="view-head">
        <div className="view-title">
          <h2>Darstellung</h2>
          <p>Optik, Sprache und Backup-Ordner der App · jede Änderung wird mit Backup gespeichert.</p>
        </div>
      </div>

      {loadError && (
        <div className="card flat">
          <div className="empty" style={{ padding: 20 }}>{loadError}</div>
        </div>
      )}
      {storeHint && (
        <StoreHintCard reason={storeHint} expert={ui.displayMode === 'expert'} />
      )}
      {ui.displayMode === 'expert' && <SettingsExpertCard />}

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
        <LanguageRow />
        <BackupPathRow
          value={String(prefs.archiveRoot ?? '')}
          onPick={() => void pickArchiveRoot()}
          onReset={() => void setPref('archiveRoot', '')}
        />
      </div>
    </main>
  )
}
