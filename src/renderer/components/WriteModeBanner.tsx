import { WriteModeIndicator } from './WriteModeIndicator'
import './WriteModeBanner.css'

// WriteModeBanner: ehemals persistenter „Bearbeiten aktivieren"-Banner.
// Owner-Entscheid 14:33 (Design-Doc §Schreibmodus): Der Aktivierungs-Zwang und
// das OFF-Banner entfallen — Schreibmodus ist default AN. Diese Komponente ist
// jetzt nur noch ein duenner Mount-Punkt fuer den schlanken Statusindikator
// (WriteModeIndicator); die Confirm-/Aktivierungslogik ist entfallen.
// Name bewusst beibehalten, damit App.tsx- und SystemSection.tsx-Mounts stabil
// bleiben. Schutz (backup-first, Confirm bei folgenreichen Aktionen, Maskierung)
// liegt unveraendert im jeweiligen Aktions-Pfad, nicht mehr in diesem Banner.
export function WriteModeBanner() {
  return <WriteModeIndicator />
}
