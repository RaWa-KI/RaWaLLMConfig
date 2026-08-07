import { test, expect } from '@playwright/test'

// WP-F2 (P1): Bei gesetztem Diagnose-Fokus war im installierten Smoke die
// gesamte Navigation blockiert — Klick auf einen anderen Bereich, kurzer
// „Wackler", Ruecksprung. Root-Causes: (1) Hook-Order-Bruch in SystemSection
// (Early-Return vor useEffect -> „Rendered more hooks" -> ErrorBoundary),
// (2) Fokus-Effekt ohne Invalidierung (zwang bei jedem Render zurueck auf den
// Fokus-Bereich), (3) Default-Kategorie-Guard blockierte auch unaufloesbare
// Fokusse 5 Minuten. Diese Spec faehrt die gebaute App (out/) hoch, setzt
// einen System-Fokus wie der Diagnose-Klick und pinnt: Der Bereichswechsel
// bleibt stehen, die Top-Nav funktioniert, kein React-Hook-Fehler.

/* eslint-disable @typescript-eslint/no-explicit-any */

const SYSTEM_LABEL = 'System'
const SETTINGS_LABEL = 'Einstellungen'

test.setTimeout(180_000)

test('gesetzter Diagnose-Fokus blockiert die Navigation nicht (WP-F2)', async () => {
  // ESM-Helfer (.mjs) aus dem Spec-Kontext via dynamic import laden.
  const { launchElectronApp, closeElectronApp } = await import('../../scripts/audit-probe/launch.mjs')
  const { gotoSection, setDisplayModeVisible, attachConsoleCollector } = await import('../../scripts/audit-probe/qa-helpers.mjs')
  const { app, win } = await launchElectronApp({ label: 'focus-navigation', readyWaitMs: 1800 })
  const errors: string[] = attachConsoleCollector(win)
  try {
    // Erststart im temp-userData: Onboarding ueberspringen (wie ui-smoke).
    await dismissOnboarding(win)
    await win.locator('.sec-btn, .nav-item, .rows, .empty').first().waitFor({ state: 'visible', timeout: 30_000 })
    // System ist Experten-Bereich (ggf. nur im „Mehr"-Menue) — wie ui-smoke.
    await setDisplayModeVisible(win, 'expert')
    await gotoSection(win, SYSTEM_LABEL)
    await win.locator('.sidebar .nav-item').first().waitFor({ state: 'visible', timeout: 30_000 })

    // Fokus-Ziel muss aufloesbar sein: Bereich mit mindestens einem Eintrag.
    const focusAreaId = await findAreaWithEntries(win)
    expect(focusAreaId, 'kein System-Bereich mit Eintraegen gefunden').toBeTruthy()

    // Fokus setzen (wie navigateToOverviewAction) und System neu betreten —
    // der Fokus-Effekt darf ihn genau einmal anwenden.
    await gotoSection(win, SETTINGS_LABEL)
    await setSystemFocus(win, focusAreaId as string)
    await gotoSection(win, SYSTEM_LABEL)
    await win.waitForTimeout(900)
    const focusedLabel = await activeAreaLabel(win)
    expect(focusedLabel).not.toBe('')

    // Anderen Sidebar-Bereich klicken: die Wahl muss stehen bleiben.
    const other = win.locator('.sidebar .nav-item:not(.on)').first()
    const otherLabel = (await other.innerText()).trim()
    expect(otherLabel).not.toBe(focusedLabel)
    await other.click()
    await win.waitForTimeout(900)
    expect(await activeAreaLabel(win)).toBe(otherLabel)

    // Top-Nav weg und zurueck: weiterhin kein Ruecksprung auf den Fokus.
    await gotoSection(win, SETTINGS_LABEL)
    await gotoSection(win, SYSTEM_LABEL)
    await win.waitForTimeout(700)
    expect(await activeAreaLabel(win)).toBe(otherLabel)

    // Kein React-Hook-/Boundary-Fehler waehrend des gesamten Laufs.
    const reactErrors = errors.filter((e) => /rendered (more|fewer) hooks|minified react error/i.test(e))
    expect(reactErrors).toEqual([])
  } finally {
    await closeElectronApp(app)
  }
})

// Erststart-Onboarding abschliessen, falls die Karte erscheint (frisches
// userData-Verzeichnis pro Launch). „Ueberspringen" beendet den Erststart.
async function dismissOnboarding(win: any): Promise<void> {
  const card = win.locator('.ob-card')
  if (!(await card.isVisible().catch(() => false))) return
  const skip = win.locator('.ob-actions button', { hasText: 'Überspringen' })
  // Scan-Phase abwarten: der Button rendert erst nach der Ordnersuche klickbar.
  await skip.waitFor({ state: 'visible', timeout: 30_000 })
  // DOM-Klick (Muster ui-smoke clickControl): das Start-Overlay faengt sonst
  // transient die Pointer-Events ab (flaky auf traegen Runnern).
  await win.evaluate(() => {
    const btn = [...document.querySelectorAll('.ob-actions button')]
      .find((el) => (el.textContent ?? '').includes('Überspringen'))
    if (btn instanceof HTMLElement) btn.click()
  })
  await card.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
}

// Klickt die System-Bereiche durch und liefert die area-id des ersten Bereichs
// mit Eintraegen (aus der Row-id „system-entry-<area>-<entry>").
async function findAreaWithEntries(win: any): Promise<string | null> {
  const items = win.locator('.sidebar .nav-item')
  const count = Math.min(await items.count(), 8)
  for (let i = 0; i < count; i++) {
    await items.nth(i).click()
    await win.waitForTimeout(300)
    const id: string = await win.evaluate(() => document.querySelector('.rows .row')?.id ?? '')
    const match = id.match(/^system-entry-([^-]+)-/)
    if (match) return match[1]
  }
  return null
}

async function setSystemFocus(win: any, areaId: string): Promise<void> {
  await win.evaluate((focusId: string) => {
    window.sessionStorage.setItem('rawallmconfig.overviewFocus', JSON.stringify({
      label: 'WP-F2-Testfokus',
      reason: 'Reproduktion des Navigations-Ruecksprungs',
      route: 'system',
      focusId,
      savedAt: Date.now()
    }))
  }, `system-entry-${areaId}-wpf2`)
}

async function activeAreaLabel(win: any): Promise<string> {
  const on = win.locator('.sidebar .nav-item.on').first()
  if (!(await on.count())) return ''
  return (await on.innerText()).trim()
}
