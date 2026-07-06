import { useState } from 'react'
import type { UserSource, ProviderChoice } from '@shared/contract-sources'
import { Icon } from '../../components/Icon'

// Eine einzelne Config-Quelle: Anzeigename (Default = Basename des Ordners),
// vollstaendiger Pfad als Sekundaerzeile, Provider-Label (aus der Provider-Liste
// per id aufgeloest, Fallback = providerId), ein Aktiv-Schalter und ein
// Entfernen-Knopf mit Inline-Bestaetigung. Reine Anzeige + Aufruf der
// uebergebenen Aktionen — kein Direktzugriff auf die Bridge.

interface SourceRowProps {
  source: UserSource
  providers: ProviderChoice[]
  onToggle(id: string, enabled: boolean): void
  onRemove(id: string): void
}

// Anzeigename ableiten: explizites Label, sonst letzter Pfad-Abschnitt.
function displayLabel(s: UserSource): string {
  if (s.label && s.label.trim()) return s.label
  const parts = s.root.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? s.root
}

// Provider-Anzeigename aufloesen; unbekannte id bleibt als Rohwert sichtbar.
function providerLabel(id: string, providers: ProviderChoice[]): string {
  return providers.find((p) => p.id === id)?.label ?? id
}

export function SourceRow({ source, providers, onToggle, onRemove }: SourceRowProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li className={'qs-row' + (source.enabled ? '' : ' qs-row--off')}>
      <label className="qs-toggle" title={source.enabled ? 'Quelle ist aktiv' : 'Quelle ist deaktiviert'}>
        <input
          type="checkbox"
          checked={source.enabled}
          onChange={() => onToggle(source.id, !source.enabled)}
          aria-label={`Quelle „${displayLabel(source)}“ ein- oder ausschalten`}
        />
        <span className="qs-track" aria-hidden="true" />
      </label>

      <span className="qs-ic" aria-hidden="true">{Icon.folder}</span>

      <div className="qs-meta">
        <div className="qs-name">{displayLabel(source)}</div>
        <div className="qs-path mono" title={source.root}>{source.root}</div>
      </div>

      <span className="qs-provider">{providerLabel(source.providerId, providers)}</span>

      {confirming ? (
        <span className="qs-confirm">
          <span className="qs-confirm-q">Entfernen?</span>
          <button type="button" className="btn-ghost sm qs-del" onClick={() => onRemove(source.id)}>
            Ja, entfernen
          </button>
          <button type="button" className="btn-ghost sm" onClick={() => setConfirming(false)}>
            Abbrechen
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn-ghost sm qs-act"
          onClick={() => setConfirming(true)}
          title="Diese Quelle aus der Liste entfernen"
        >
          {Icon.trash}
          Entfernen
        </button>
      )}
    </li>
  )
}
