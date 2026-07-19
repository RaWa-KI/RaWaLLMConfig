import { Suspense, lazy, useEffect } from 'react'
import { useStore } from './state/store'
import { WriteConfigProvider } from './state/store-write-config'
import { scheduleSectionPrefetch } from './lib/prefetch-sections'
import { LlmBar } from './chrome/LlmBar'
import { TopBar } from './chrome/TopBar'
import { HealthBar } from './chrome/HealthBar'
import { ConfigSection } from './sections/config/ConfigSection'
import { SystemSection } from './sections/system/SystemSection'
import { PrefsSection } from './sections/prefs/PrefsSection'
import { SettingsSection } from './sections/settings/SettingsSection'
import { SourcesSection } from './sections/quellen/SourcesSection'
import { OverviewSection } from './sections/overview/OverviewSection'
import { Drawer } from './components/Drawer'
import { Toast } from './components/Toast'
import { StartupProgress } from './components/StartupProgress'
import { WriteModeBanner } from './components/WriteModeBanner'
import { SectionFallback } from './components/SectionFallback'
import { useSources } from './state/useSources'
import { sectionVisibleForMode } from './chrome/nav-visibility'
import type { Section } from './state/types'

// Lazy-Sektionen (Teilplan C): selten geoeffnete, datenreiche Bereiche loesen
// sich per dynamischem Import aus dem Startbundle (Referenz ist mit ~1.900
// Zeilen Daten der groesste Brocken). Der Kern-Startpfad (overview, config,
// system, settings, prefs, quellen) bleibt statisch gebundelt.
const UpdatesSection = lazy(() =>
  import('./sections/updates/UpdatesSection').then((m) => ({ default: m.UpdatesSection }))
)
const StrukturSection = lazy(() =>
  import('./sections/struktur/StrukturSection').then((m) => ({ default: m.StrukturSection }))
)
const ReferenceSection = lazy(() =>
  import('./sections/referenz/ReferenceSection').then((m) => ({ default: m.ReferenceSection }))
)
const GraphSection = lazy(() =>
  import('./sections/graph/GraphSection').then((m) => ({ default: m.GraphSection }))
)
const TreeSection = lazy(() =>
  import('./sections/baum/TreeSection').then((m) => ({ default: m.TreeSection }))
)
const ArchivSection = lazy(() =>
  import('./sections/archiv/ArchivSection').then((m) => ({ default: m.ArchivSection }))
)
const OnboardingFlow = lazy(() =>
  import('./sections/onboarding/OnboardingFlow').then((m) => ({ default: m.OnboardingFlow }))
)

// Renderer-Wurzel. Komponiert Chrome-Leisten, aktive Sektion, Detail-Drawer und
// Toast. Welle 3 (WP-INT-06): WriteConfigProvider umschliesst die Sektionen
// (DrawerEdit/EntryActions/EditForm brauchen useWriteConfig()); PrefsSection
// (Tweaks) ist eingehaengt. Reconcile-/Prefs-Slices sind reine Hooks (kein
// Provider noetig). Die Topbar-/Sektions-Optik bleibt unveraendert.
// WriteModeBanner: schlanker, nicht-blockierender Schreibmodus-Indikator am
// Layout-Anfang (Owner-Entscheid 14:33: kein „Bearbeiten aktivieren"-Banner mehr,
// Schreibmodus default AN). In der System-Ansicht wird der globale Indikator
// unterdrueckt — dort haengt eine eigene Instanz im Section-Header (WP-S: kein
// Doppel-Indikator "Bearbeiten aktiv").
export function App() {
  const { ui, config, system, watcher } = useStore()
  const sources = useSources()
  // Idle-Prefetch der Lazy-Chunks (Teilplan F, caudex-Budget Kalt-Nav): einmal
  // nach dem ersten Commit, fire-and-forget — VOR dem First-Run-Gate, damit
  // die Hook-Reihenfolge stabil bleibt und der Startpfad nicht gedrosselt wird.
  useEffect(() => { scheduleSectionPrefetch() }, [])
  // First-Run-Gate (OSS Teil C): Beim Erststart (Onboarding noch nicht
  // abgeschlossen/uebersprungen) zeigt die App das Vollbild-Onboarding statt der
  // normalen Oberflaeche. Intern ist der Abschluss versioniert; Settings kann den
  // Flow erneut oeffnen. Waehrend des Ladens (loading) zeigt der
  // Gate nichts, damit kein Onboarding-Aufblitzen entsteht.
  if (!sources.loading && !sources.onboardingDone) {
    return (
      <Suspense fallback={<SectionFallback label="Einführung wird geladen …" />}>
        <OnboardingFlow src={sources} />
      </Suspense>
    )
  }
  // Struktur-Weiche (Owner-Entscheid D1/D2, 2026-07-18): Experten-Bereiche
  // (baum/graph/system/struktur) fallen im Simple-Modus auf die Uebersicht
  // zurueck. Reiner Anzeige-Guard an der Section-Weiche — ui.section im Store
  // bleibt unveraendert (kein Redirect-State-Eingriff), damit Chrome
  // (Banner/TopBar/HealthBar) und Body dieselbe Sektion zeigen.
  const section = sectionVisibleForMode(ui.section, ui.displayMode) ? ui.section : 'overview'
  return (
    <WriteConfigProvider>
      {section !== 'system' && <WriteModeBanner />}
      <LlmBar />
      <StartupProgress loading={{
        sources: sources.loading,
        config: config.loading,
        system: system.loading,
        watcher: watcher.loading
      }} />
      {section !== 'overview' && <TopBar />}
      {section === 'config' && <HealthBar />}
      <div className="shell">
        {config.loading && section === 'config'
          ? <div className="empty">Config wird geladen…</div>
          : <SectionBody section={section} onReopenOnboarding={() => void sources.reopenOnboarding()} />
        }
      </div>
      <Drawer />
      <Toast />
    </WriteConfigProvider>
  )
}

// Sektions-Weiche: Baum / Referenz / Graph / System / Updates / Tweaks / Struktur /
// (Default) Config. Erweiterungs-Zweige (WP-H0) stehen VOR dem Default-Return.
// Lazy-Sektionen haengen an EINER Suspense-Grenze mit zugaenglichem Fallback
// (Teilplan C); statische Sektionen loesen die Grenze nie aus.
function SectionBody({ section, onReopenOnboarding }: { section: Section; onReopenOnboarding: () => void }) {
  return (
    <Suspense fallback={<SectionFallback label="Bereich wird geladen …" />}>
      <SectionSwitch section={section} onReopenOnboarding={onReopenOnboarding} />
    </Suspense>
  )
}

function SectionSwitch({ section, onReopenOnboarding }: { section: Section; onReopenOnboarding: () => void }) {
  if (section === 'overview') return <OverviewSection />
  if (section === 'baum') return <TreeSection />
  if (section === 'referenz') return <ReferenceSection />
  if (section === 'graph') return <GraphSection />
  if (section === 'system') return <SystemSection />
  if (section === 'updates') return <UpdatesSection />
  if (section === 'settings') return <SettingsSection onReopenOnboarding={onReopenOnboarding} />
  if (section === 'prefs') return <PrefsSection />
  if (section === 'struktur') return <StrukturSection />
  if (section === 'archiv') return <ArchivSection />
  if (section === 'quellen') return <SourcesSection />
  return <ConfigSection />
}
