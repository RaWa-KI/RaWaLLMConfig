// Gemeinsame QA-Helfer fuer die F-WP4-Skripte (design-shots, width-probe,
// qa-matrix, user-tasks). Nur Auswertung/Navigation — keine Produktmutation.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Hauptnav-Labels der neuen D5-Nav (LlmBar.tsx).
export const NAV_LABELS = {
  overview: 'Überblick',
  updates: 'Prüfen',
  config: 'Ändern',
  archiv: 'Wiederherstellen',
  settings: 'Einstellungen'
}

// Konsolenfehler-Sammler (console type=error + pageerror). Rueckgabe ist das
// live Array; Aufrufer merken sich die Laenge als Offset pro Zelle/Task.
export function attachConsoleCollector(win) {
  const errors = []
  win.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 300))
  })
  win.on('pageerror', (err) => errors.push(String(err).split('\n')[0].slice(0, 300)))
  return errors
}

// Horizontaler Overflow als Bruch-Indikator (1px Toleranz).
export async function measureOverflow(win) {
  return win.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }))
}

export async function resizeWindow(app, win, width, height) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) w.setSize(size.width, size.height)
  }, { width, height })
  await win.waitForTimeout(500)
}

// Startreife abwarten: StartupProgress blendet sich aus, wenn Quellen/Config/
// System/Watcher geladen sind; danach keine grossen Re-Render-Spruenge mehr.
// Toleriert Fehlschlag (SPA ohne Startup-Karte) — Klicks melden eigene Fehler.
export async function waitForStartup(win, timeoutMs = 30000) {
  await win.locator('.startup-progress').waitFor({ state: 'detached', timeout: timeoutMs }).catch(() => {})
  await win.waitForTimeout(400)
}

// Klick auf einen Hauptnav-Button. Wirft bei Fehlschlag (Aufrufer meldet WARN/FAIL).
// Ein Retry faengt den transienten Start-Overlay-Fall (StartupProgress) ab.
export async function clickNav(win, label) {
  const btn = win.locator('.llmbar .sec-btn', { hasText: label }).first()
  await btn.waitFor({ state: 'visible', timeout: 10000 })
  try {
    await btn.click({ timeout: 6000 })
  } catch {
    await win.waitForTimeout(1200)
    await btn.click({ timeout: 6000 })
  }
  await win.waitForTimeout(500)
}

export async function openMoreMenu(win) {
  await win.locator('.sec-btn.nav-more').click({ timeout: 5000 })
  await win.locator('.nav-overflow-menu').waitFor({ state: 'visible', timeout: 5000 })
}

// Breiten-unabhaengige Bereichs-Navigation: <=560px sind die Nav-Buttons
// per CSS versteckt; dann fuehrt der Weg ueber das Mehr-Menue (menu-mobile-
// Eintraege). Gibt den genutzten Weg zurueck ('nav' | 'menu').
export async function gotoSection(win, label) {
  const btn = win.locator('.llmbar .sec-btn', { hasText: label }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await win.waitForTimeout(500)
    return 'nav'
  }
  await openMoreMenu(win)
  await win.locator('.nav-overflow-menu .sec-btn.menu-item', { hasText: label }).first().click({ timeout: 5000 })
  await win.waitForTimeout(600)
  return 'menu'
}

// DisplayMode idempotent setzen. Der Umschalter sitzt im Ueberblick-Kopf —
// Aufrufer navigiert vorher zur Ueberblick-Sektion.
export async function setDisplayMode(win, mode) {
  const label = mode === 'expert' ? 'Experte' : 'Einfach'
  const btn = win.locator('.display-mode-switch button', { hasText: label })
  await btn.waitFor({ state: 'visible', timeout: 5000 })
  if ((await btn.getAttribute('aria-pressed')) !== 'true') {
    await btn.click()
    await win.waitForTimeout(600)
  }
}

// Breiten-unabhaengiger Modus-Wechsel: <=1120px ist der Ueberblick-Kopf-
// Schalter per CSS versteckt (`.section-switch > .sec-btn.compact`), sichtbar
// bleibt nur die TopBar-Variante auf Nicht-Ueberblick-Sektionen. Gibt den
// genutzten Weg zurueck ('overview-head' | 'topbar').
export async function setDisplayModeVisible(win, mode) {
  const label = mode === 'expert' ? 'Experte' : 'Einfach'
  const head = win.locator('.ov-head .display-mode-switch button', { hasText: label })
  if (await head.isVisible().catch(() => false)) {
    if ((await head.getAttribute('aria-pressed')) !== 'true') {
      await head.click()
      await win.waitForTimeout(600)
    }
    return 'overview-head'
  }
  await clickNav(win, NAV_LABELS.updates)
  const top = win.locator('.top .display-mode-switch button', { hasText: label })
  await top.waitFor({ state: 'visible', timeout: 5000 })
  if ((await top.getAttribute('aria-pressed')) !== 'true') {
    await top.click()
    await win.waitForTimeout(600)
  }
  return 'topbar'
}

export function writeReport(path, payload) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
}
