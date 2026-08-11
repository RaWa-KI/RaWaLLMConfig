// playwright.config.ts (tests/write) — Node-Sandbox-Tests fuer den Write-Kern.
// Kein Browser noetig: reine Node-Service-Tests gegen temp-Sandbox. Playwright
// dient nur als Test-Runner (test/expect) ohne neue Dependency.
import { defineConfig } from '@playwright/test'
import { registerCssRequireStub } from './css-require-stub'

// Zentraler .css-Loader-Hook fuer die Komponenten-Specs (Drawer,
// ConfigDiagnostics): Playwright laedt diese Config in JEDEM Worker-Prozess,
// bevor dort Spec-Dateien ausgewertet werden. Damit duerfen Renderer-Module
// statisch importiert werden, ohne dass jede Spec ihren eigenen
// require.extensions-Hack vor dem Import setzen muss. Detail: css-require-stub.ts.
registerCssRequireStub()

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
