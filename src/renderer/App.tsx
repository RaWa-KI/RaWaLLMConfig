import { useStore } from './state/store'
import { WriteConfigProvider } from './state/store-write-config'
import { LlmBar } from './chrome/LlmBar'
import { TopBar } from './chrome/TopBar'
import { HealthBar } from './chrome/HealthBar'
import { ConfigSection } from './sections/config/ConfigSection'
import { SystemSection } from './sections/system/SystemSection'
import { UpdatesSection } from './sections/updates/UpdatesSection'
import { PrefsSection } from './sections/prefs/PrefsSection'
import { SettingsSection } from './sections/settings/SettingsSection'
import { StrukturSection } from './sections/struktur/StrukturSection'
import { ReferenceSection } from './sections/referenz/ReferenceSection'
import { GraphSection } from './sections/graph/GraphSection'
import { TreeSection } from './sections/baum/TreeSection'
import { ArchivSection } from './sections/archiv/ArchivSection'
import { SourcesSection } from './sections/quellen/SourcesSection'
import { OnboardingFlow } from './sections/onboarding/OnboardingFlow'
import { Drawer } from './components/Drawer'
import { Toast } from './components/Toast'
import { WriteModeBanner } from './components/WriteModeBanner'
import { useSources } from './state/useSources'

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
  const { ui, config } = useStore()
  // First-Run-Gate (OSS Teil C): Beim Erststart (Onboarding noch nicht
  // abgeschlossen/uebersprungen) zeigt die App das Vollbild-Onboarding statt der
  // normalen Oberflaeche. `onboardingDone` ist einbahnig — nach Skip/Abschluss
  // erscheint die Begruessung nie wieder. Waehrend des Ladens (loading) zeigt der
  // Gate nichts, damit kein Onboarding-Aufblitzen entsteht.
  const sources = useSources()
  if (!sources.loading && !sources.onboardingDone) {
    return <OnboardingFlow src={sources} />
  }
  return (
    <WriteConfigProvider>
      {ui.section !== 'system' && <WriteModeBanner />}
      <LlmBar />
      <TopBar />
      {ui.section === 'config' && <HealthBar />}
      <div className="shell">
        {config.loading && ui.section === 'config'
          ? <div className="empty">Config wird geladen…</div>
          : <SectionBody section={ui.section} />
        }
      </div>
      <Drawer />
      <Toast />
    </WriteConfigProvider>
  )
}

// Sektions-Weiche: Baum / Referenz / Graph / System / Updates / Tweaks / Struktur /
// (Default) Config. Erweiterungs-Zweige (WP-H0) stehen VOR dem Default-Return.
function SectionBody({ section }: { section: string }) {
  if (section === 'baum') return <TreeSection />
  if (section === 'referenz') return <ReferenceSection />
  if (section === 'graph') return <GraphSection />
  if (section === 'system') return <SystemSection />
  if (section === 'updates') return <UpdatesSection />
  if (section === 'settings') return <SettingsSection />
  if (section === 'prefs') return <PrefsSection />
  if (section === 'struktur') return <StrukturSection />
  if (section === 'archiv') return <ArchivSection />
  if (section === 'quellen') return <SourcesSection />
  return <ConfigSection />
}
