// OnboardingFlow.tsx — Vollbild-Begruessung beim allerersten Start (OSS Teil C,
// WP-C4). Eigene Huelle ohne Kopf-/Provider-Leisten: zeigt laienverstaendlich,
// was die App tut, sucht beim Oeffnen automatisch die ueblichen Ordner und
// laesst den Nutzer auswaehlen, welche eingelesen werden. Saemtliche Aktionen
// laufen ueber die uebergebene `src`-Schnittstelle — kein Direktzugriff auf
// window/IPC. Treffer sind per Default angehakt (Owner-Entscheid); Ueberspringen
// ist erlaubt. Nach Uebernehmen/Ueberspringen wird der Erststart abgeschlossen.
import { useEffect, useState, type ReactElement } from 'react'
import type { DiscoveryHit } from '@shared/contract-sources'
import type { UseSources } from '../../state/useSources'
import { Icon } from '../../components/Icon'
import { DiscoveryStep } from './DiscoveryStep'
import './onboarding.css'

type Phase = 'scan' | 'choose' | 'busy'

export function OnboardingFlow({ src }: { src: UseSources }): ReactElement {
  const [phase, setPhase] = useState<Phase>('scan')
  const [hits, setHits] = useState<DiscoveryHit[]>([])
  // Angehakte Treffer (Schluessel = root). Vorbelegt AKTIV (Owner-Entscheid).
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // Beim Oeffnen einmal die Standard-Ordner suchen und alle vorauswaehlen.
  useEffect(() => {
    let live = true
    void (async () => {
      const found = await src.discover()
      if (!live) return
      setHits(found)
      setPicked(new Set(found.map((h) => h.root)))
      setPhase('choose')
    })()
    return () => {
      live = false
    }
  }, [src])

  function toggle(root: string): void {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(root)) next.delete(root)
      else next.add(root)
      return next
    })
  }

  // Ausgewaehlte Treffer als Quellen aufnehmen, dann Erststart abschliessen.
  async function takeOver(): Promise<void> {
    setPhase('busy')
    for (const hit of hits) {
      if (!picked.has(hit.root)) continue
      await src.addSource({ root: hit.root, providerId: hit.providerId, label: hit.label, enabled: true })
    }
    await src.completeOnboarding()
  }

  async function skip(): Promise<void> {
    setPhase('busy')
    await src.completeOnboarding()
  }

  // Eigenen Ordner waehlen: liefert nur einen Pfad. Als generische Claude-Quelle
  // aufnehmen; die volle Verwaltung (Provider aendern, entfernen) kommt spaeter
  // in der Quellen-Sektion. Bricht der Nutzer ab, passiert nichts.
  async function pickOwn(): Promise<void> {
    const path = await src.pickFolder()
    if (!path) return
    const exists = hits.some((h) => h.root === path)
    if (!exists) setHits((prev) => [...prev, { root: path, providerId: 'claude', label: path }])
    setPicked((prev) => new Set(prev).add(path))
  }

  return (
    <div className="ob-screen">
      <div className="ob-card">
        <ObHeader />
        <ObBody phase={phase} hits={hits} picked={picked} onToggle={toggle} />
        <ObActions
          phase={phase}
          pickedCount={picked.size}
          onTakeOver={() => void takeOver()}
          onSkip={() => void skip()}
          onPickOwn={() => void pickOwn()}
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
  phase: Phase
  hits: DiscoveryHit[]
  picked: Set<string>
  onToggle: (root: string) => void
}): ReactElement {
  const { phase, hits, picked, onToggle } = props
  if (phase === 'scan') {
    return (
      <div className="ob-state">
        <span className="ob-spin" aria-hidden>{Icon.refresh}</span>
        <p>Suche nach vorhandenen Ordnern …</p>
      </div>
    )
  }
  if (hits.length === 0) {
    return (
      <div className="ob-state">
        <span className="ob-state-ic" aria-hidden>{Icon.folder}</span>
        <p>
          Keine Standard-Ordner gefunden — du kannst die App leer starten und
          später Ordner hinzufügen.
        </p>
      </div>
    )
  }
  return (
    <div className="ob-list-wrap">
      <p className="ob-list-hint">Gefundene Ordner ({hits.length}):</p>
      <DiscoveryStep hits={hits} selected={picked} onToggle={onToggle} />
    </div>
  )
}

function ObActions(props: {
  phase: Phase
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
