// css-require-stub.ts — EIN zentraler Loader-Hook fuer die Node-Service-Tests.
// Renderer-Module (Drawer, ConfigDiagnostics, ...) importieren ihre eigene
// .css-Datei. Der Node-Runner kann CSS nicht parsen und wuerde beim Laden des
// Komponenten-Moduls werfen. Der Hook registriert einmalig eine leere
// .css-Ladefunktion, damit Komponenten-Specs die Renderer-Module ganz normal
// STATISCH importieren koennen — vorher trug jede betroffene Spec ihren eigenen
// `require.extensions`-Hack, der zwingend VOR dem require des Moduls stehen
// musste (und statische Imports damit ausschloss).
//
// Geladen wird der Hook aus tests/write/playwright.config.ts. Playwright wertet
// die Config in JEDEM Worker-Prozess aus, bevor dort eine Spec-Datei geladen
// wird — der Hook steht also fuer alle Specs bereit, ohne Zeile pro Spec.
import Module from 'node:module'

// Node fuehrt die Endungs-Loader in `Module._extensions` (identisch mit dem
// deprecateten `require.extensions`). Eigener schmaler Typ statt `any`.
type ExtensionLoader = (module: unknown, filename: string) => void

/** Leeren .css-Loader registrieren (idempotent, mehrfacher Aufruf schadet nicht). */
export function registerCssRequireStub(): void {
  const loaders = (Module as unknown as { _extensions: Record<string, ExtensionLoader> })._extensions
  loaders['.css'] ??= () => undefined
}
