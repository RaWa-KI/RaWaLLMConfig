// playwright.config.ts (tests/write) — Node-Sandbox-Tests fuer den Write-Kern.
// Kein Browser noetig: reine Node-Service-Tests gegen temp-Sandbox. Playwright
// dient nur als Test-Runner (test/expect) ohne neue Dependency.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // NICHT fullyParallel: einige Specs (write-mode/config-roots) invalidieren den
  // require-Cache von write-mode.ts, um Env neu zu lesen. Bei test-weisem
  // Interleaving (fullyParallel) divergieren die write-mode-Singletons zwischen
  // diesen Specs und secret-guard -> der In-App-Toggle trifft die falsche Instanz
  // (Flaky :117/:314). Pro-Datei-sequentiell pro Worker + Cache-Restore-afterEach
  // (write-mode.spec) macht den Lauf deterministisch. Dateien laufen weiter
  // parallel ueber Worker (separate Prozesse, kein geteilter Cache).
  fullyParallel: false,
  reporter: [['list']],
  use: {}
})
