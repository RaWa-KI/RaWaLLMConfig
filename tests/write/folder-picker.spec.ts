// folder-picker.spec.ts — Kapsel um den Electron-Ordner-Dialog (WP-C2).
// Reine Logik-Pruefung: der Dialog wird per Option injiziert (Fake), damit der
// Test OHNE echtes Electron-Fenster laeuft. Kernbeweise: Auswahl liefert den
// Pfad, Abbruch und leere Auswahl liefern null (kein Throw, kein Pfad-Leak).
// Runner: Playwright (test/expect) als reiner Node-Test-Runner.
import { test, expect } from '@playwright/test'
import { pickFolder } from '../../src/main/services/folder-picker'
import type { dialog } from 'electron'

// Fake-Dialog-Fabrik: liefert ein festes showOpenDialog-Ergebnis zurueck.
function fakeDialog(
  res: { canceled: boolean; filePaths: string[] },
): typeof dialog.showOpenDialog {
  return (async () => res) as unknown as typeof dialog.showOpenDialog
}

test('Auswahl eines Ordners liefert den absoluten Pfad', async () => {
  const showDialog = fakeDialog({ canceled: false, filePaths: ['/gewaehlt/x'] })
  expect(await pickFolder({ showDialog })).toBe('/gewaehlt/x')
})

test('Abbruch (canceled) liefert null', async () => {
  const showDialog = fakeDialog({ canceled: true, filePaths: [] })
  expect(await pickFolder({ showDialog })).toBe(null)
})

test('leere Auswahl trotz nicht-canceled liefert null', async () => {
  const showDialog = fakeDialog({ canceled: false, filePaths: [] })
  expect(await pickFolder({ showDialog })).toBe(null)
})
