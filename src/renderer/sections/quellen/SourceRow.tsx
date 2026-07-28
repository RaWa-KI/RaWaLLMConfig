import { useState } from 'react'
import type { UserSource, ProviderChoice } from '@shared/contract-sources'
import { normalizePathForCompare, rendererPathComparisonPlatformFor } from '@shared/path-compare'
import { Icon } from '../../components/Icon'

// Eine einzelne Config-Quelle: Anzeigename (Default = Basename des Ordners),
// vollstaendiger Pfad als Sekundaerzeile, Provider-Label (aus der Provider-Liste
// per id aufgeloest, Fallback = providerId), ein Aktiv-Schalter und ein
// Entfernen-Knopf mit Inline-Bestaetigung. Reine Anzeige + Aufruf der
// uebergebenen Aktionen — kein Direktzugriff auf die Bridge.
// WP-6 (B8): Zeilen, die auf einen Standard-Ordner zeigen, werden als
// „Standard — wird ohnehin gelesen" markiert; das Provider-Badge erklaert per
// Tooltip, welcher Scanner den Ordner liest.

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

// Die drei Tool-Homes liest der Scanner immer (Basis-Roots bzw. festes
// Manifest-Root, vgl. TOOL_HOME_DIRS in scan/struktur-roots.ts). Erkennung
// ueber das letzte Pfad-Segment, plattformgerecht normalisiert (Windows:
// Gross-/Kleinschreibung egal). Ein fremder Ordner gleichen Namens wird
// faelschlich markiert — harmlos, da reiner Hinweistext.
const STANDARD_TOOL_HOMES: Readonly<Record<string, string>> = {
  '.claude': 'Claude',
  '.codex': 'Codex',
  '.kimi-code': 'Kimi'
}

function standardToolHome(root: string): string | null {
  const normalized = normalizePathForCompare(root, rendererPathComparisonPlatformFor(root))
  const last = normalized.split('/').filter(Boolean).pop() ?? ''
  return STANDARD_TOOL_HOMES[last] ?? null
}

// Name, Pfad und — bei Standard-Ordnern — der „Standard"-Hinweis.
function SourceMeta({ source }: { source: UserSource }) {
  const standard = standardToolHome(source.root)
  return (
    <div className="qs-meta">
      <div className="qs-name">{displayLabel(source)}</div>
      <div className="qs-path mono" title={source.root}>{source.root}</div>
      {standard && (
        <div className="qs-path" title={`Das ist der Standard-Ordner von ${standard} — die App liest ihn immer mit.`}>
          Standard — wird ohnehin gelesen
        </div>
      )}
    </div>
  )
}

// Entfernen-Knopf mit Inline-Bestaetigung (zwei Schritte, kein Modal).
function SourceRemoveAction(props: {
  confirming: boolean
  onConfirming(next: boolean): void
  onRemove(): void
}) {
  const { confirming, onConfirming, onRemove } = props
  if (confirming) {
    return (
      <span className="qs-confirm">
        <span className="qs-confirm-q">Entfernen?</span>
        <button type="button" className="btn-ghost sm qs-del" onClick={onRemove}>
          Ja, entfernen
        </button>
        <button type="button" className="btn-ghost sm" onClick={() => onConfirming(false)}>
          Abbrechen
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      className="btn-ghost sm qs-act"
      onClick={() => onConfirming(true)}
      title="Diese Quelle aus der Liste entfernen"
    >
      {Icon.trash}
      Entfernen
    </button>
  )
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

      <SourceMeta source={source} />

      <span
        className="qs-provider"
        title={`Gelesen von: ${providerLabel(source.providerId, providers)}-Scanner`}
      >
        {providerLabel(source.providerId, providers)}
      </span>

      <SourceRemoveAction
        confirming={confirming}
        onConfirming={setConfirming}
        onRemove={() => onRemove(source.id)}
      />
    </li>
  )
}
