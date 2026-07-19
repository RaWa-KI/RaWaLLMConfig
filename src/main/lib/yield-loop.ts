// yield-loop.ts — Event-Loop zwischen schweren synchronen Scan-Schritten
// freigeben (Teilplan B). Der Vollscan bleibt synchroner fs-Code, aber zwischen
// Familien/Phasen kann der Main-Prozess IPC (z.B. readWatcher, Onboarding-Gate)
// zwischenschlachten -> keine Eingabeblockade waehrend des kalten Scans.
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
