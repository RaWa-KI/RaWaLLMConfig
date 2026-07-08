// OnboardingFlow.tsx — Vollbild-Begruessung beim allerersten Start (OSS Teil C,
// WP-C4). Eigene Huelle ohne Kopf-/Provider-Leisten: zeigt laienverstaendlich,
// was die App tut, sucht beim Oeffnen automatisch die ueblichen Ordner und
// laesst den Nutzer auswaehlen, welche eingelesen werden. Saemtliche Aktionen
// laufen ueber die uebergebene `src`-Schnittstelle — kein Direktzugriff auf
// window/IPC. Treffer sind per Default angehakt (Owner-Entscheid); Ueberspringen
// ist erlaubt. Nach Uebernehmen/Ueberspringen wird der Erststart abgeschlossen.
import type { ReactElement } from 'react'
import type { DiscoveryHit, ModelDiscoveryHit } from '@shared/contract-sources'
import type { UseSources } from '../../state/useSources'
import { Icon } from '../../components/Icon'
import { ModelDiscoveryStep } from './ModelDiscoveryStep'
import { SourceChoiceStep } from './SourceChoiceStep'
import { useOnboardingFlow, type OnboardingPhase } from './useOnboardingFlow'
import './onboarding.css'

export function OnboardingFlow({ src }: { src: UseSources }): ReactElement {
  const flow = useOnboardingFlow(src)

  return (
    <div className="ob-screen">
      <div className="ob-card">
        <ObHeader />
        <ObBody
          phase={flow.phase}
          hits={flow.hits}
          modelHits={flow.modelHits}
          picked={flow.picked}
          onToggle={flow.toggle}
          onPickModelFolder={() => void flow.pickModelFolder()}
        />
        <ObActions
          phase={flow.phase}
          pickedCount={flow.picked.size}
          onTakeOver={() => void flow.takeOver()}
          onSkip={() => void flow.skip()}
          onPickOwn={() => void flow.pickOwn()}
        />
      </div>
    </div>
  )
}

function ObHeader(): ReactElement {
  return (
    <header className="ob-head">
      <span className="ob-logo" aria-hidden>{Icon.sparkle}</span>
      <h1 className="ob-title">Willkommen</h1>
      <p className="ob-lead">
        Diese App zeigt dir deine KI-Konfigurationen übersichtlich an. Wähle unten,
        welche Ordner sie einlesen soll. Du kannst das später jederzeit ändern.
      </p>
    </header>
  )
}

function ObBody(props: {
  phase: OnboardingPhase
  hits: DiscoveryHit[]
  modelHits: ModelDiscoveryHit[]
  picked: Set<string>
  onToggle: (root: string) => void
  onPickModelFolder: () => void
}): ReactElement {
  const { phase, hits, modelHits, picked, onToggle, onPickModelFolder } = props
  if (phase === 'scan') {
    return (
      <div className="ob-state">
        <span className="ob-spin" aria-hidden>{Icon.refresh}</span>
        <p>Suche nach vorhandenen Ordnern …</p>
      </div>
    )
  }
  return (
    <>
      <ModelDiscoveryStep hits={modelHits} onPickModelFolder={onPickModelFolder} busy={phase === 'busy'} />
      <SourceChoiceStep hits={hits} picked={picked} onToggle={onToggle} />
    </>
  )
}

function ObActions(props: {
  phase: OnboardingPhase
  pickedCount: number
  onTakeOver: () => void
  onSkip: () => void
  onPickOwn: () => void
}): ReactElement {
  const { phase, pickedCount, onTakeOver, onSkip, onPickOwn } = props
  const busy = phase === 'busy' || phase === 'scan'
  return (
    <footer className="ob-actions">
      <button type="button" className="btn ghost" onClick={onPickOwn} disabled={busy}>
        {Icon.folder}
        Eigenen Ordner wählen
      </button>
      <div className="ob-actions-main">
        <button type="button" className="btn ghost" onClick={onSkip} disabled={busy}>
          Überspringen
        </button>
        <button type="button" className="btn primary" onClick={onTakeOver} disabled={busy || pickedCount === 0}>
          {Icon.check}
          Quellen übernehmen
        </button>
      </div>
    </footer>
  )
}
