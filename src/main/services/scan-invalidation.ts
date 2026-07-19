// scan-invalidation.ts — EIN Invalidierungs-Punkt fuer alle Scan-Caches
// (Teilplan B). Regel: Caches werden NUR ueber (a) erfolgreiche Aenderungen
// (Write-Handler melden Erfolg) und (b) debouncte Watcher-Signale stale
// markiert — niemals pauschal zeitbasiert. Aktuell betroffen: Config-Scan-
// Cache (readConfig) und Struktur-Scan-Cache.
import { markConfigScanCacheStale } from './config-scan-cache'
import { markStrukturScanCacheStale } from '../scan/struktur-scan'

export function markScanCachesStale(reason: string): void {
  markConfigScanCacheStale(reason)
  markStrukturScanCacheStale()
}
