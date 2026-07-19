// perf-metrics.mjs — Mess-Primitive fuer perf:ui (F-WP1) plus Legacy-Helfer.
// NEU (oben): Polling-Messungen (~25 ms) auf sichtbare Zustaende — KEINE festen
// Wartezeiten in Messgroessen. LEGACY (unten): navByText/scrollMetric/
// appTextLength/visibleCount mit Festwarte — unveraendert fuer
// vorher-baseline.mjs (Vorher/Nachher-Vergleichbarkeit).
const DEFAULT_TIMEOUT_MS = 15_000
const POLL_MS = 25

export function nowMs() {
  return Math.round(performance.now())
}

// Sichtbarkeitsprobe im Seitenkontext (Box + display/visibility; optional Text).
function visibleProbe({ selector, text }) {
  const visible = (el) => {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  return [...document.querySelectorAll(selector)].some(
    (el) => visible(el) && (text == null || (el.textContent ?? '').includes(text))
  )
}

// Warte bis selector sichtbar ist (Polling ~25 ms, keine Festwarte).
export async function waitForVisible(win, selector, { text = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  await win.waitForFunction(visibleProbe, { selector, text }, { polling: POLL_MS, timeout: timeoutMs })
}

// Warte bis selector NICHT mehr im DOM ist (Polling ~25 ms, keine Festwarte).
export async function waitForGone(win, selector, timeoutMs = DEFAULT_TIMEOUT_MS) {
  await win.waitForFunction((sel) => !document.querySelector(sel), selector, { polling: POLL_MS, timeout: timeoutMs })
}

// ms von einem beliebigen Startpunkt (Date.now) bis selector sichtbar.
export async function msUntilVisible(win, selector, startedAt, opts = {}) {
  await waitForVisible(win, selector, opts)
  return Date.now() - startedAt
}

// .sec-btn per sichtbarem Text/aria-label/title finden und klicken.
export async function clickSecBtn(win, label) {
  await win.evaluate((text) => {
    const controls = [...document.querySelectorAll('.sec-btn')]
    const found = controls.find((el) => {
      const haystack = [el.textContent ?? '', el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? '']
      return haystack.some((value) => value.includes(text))
    })
    if (!(found instanceof HTMLElement)) throw new Error(`control not found: ${text}`)
    found.click()
  }, label)
}

// navMs: Klick auf sec-btn <label> -> Ziel-Root sichtbar (Polling ~25 ms).
export async function navToSectionMs(win, label, rootSelector, { text = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const started = Date.now()
  await clickSecBtn(win, label)
  await waitForVisible(win, rootSelector, { text, timeoutMs })
  return Date.now() - started
}

// scrollLongTaskMetric: PerformanceObserver('longtask') injizieren, gestuft
// scrollen (mehrere scrollBy-Schritte, je zwei Frames Abstand), 500 ms settle
// (Vorgabe), Eintraege auslesen. Hart: maxDurationMs < 200.
export async function scrollLongTaskMetric(win) {
  await win.evaluate(() => {
    window.__perfLongTasks = []
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__perfLongTasks.push(entry.duration)
      }).observe({ type: 'longtask', buffered: false })
    } catch {
      window.__perfLongTasksUnsupported = true
    }
  })
  for (let step = 0; step < 4; step++) {
    await win.evaluate(() => {
      const el = document.querySelector('.main') ?? document.scrollingElement
      el?.scrollBy?.(0, 600)
    })
    await win.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  await win.waitForTimeout(500)
  return win.evaluate(() => {
    const list = Array.isArray(window.__perfLongTasks) ? window.__perfLongTasks : []
    const max = list.length > 0 ? Math.round(Math.max(...list)) : 0
    return { count: list.length, maxDurationMs: max, unsupported: !!window.__perfLongTasksUnsupported, durationsMs: list.map(Math.round) }
  })
}

// ── In-Page-Messung (F-WP2c) ─────────────────────────────────────────────────
// Klick + Warten + Delta laufen in EINEM Renderer-Evaluate: die CDP-Roundtrip-
// Latenz liegt ausserhalb der Messgroesse (Profil-Beleg mount-profile-2026-07-18:
// ~330 ms Messboden bei CPU≈0). Selektoren/Roots unveraendert (Semantik wie WP1).

// Page-Helfer einmalig installieren (idempotent). spec: { clickLabel, kind:
// 'root'|'classOn', selector, text, timeoutMs } — kind 'root' wartet auf eine
// sichtbare Sektions-Root, 'classOn' auf den Klassenwechsel des geklickten
// Buttons im Scope (DisplayModeSwitch-Feedback).
export async function installInPageMeasure(win) {
  await win.evaluate(() => {
    if (window.__perfMeasureClick) return
    window.__perfMeasureClick = (spec) => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }
      const probe = () => {
        if (spec.kind === 'classOn') {
          const scopeEl = document.querySelector(spec.selector)
          const button = scopeEl ? [...scopeEl.querySelectorAll('.sec-btn')].find((el) => (el.textContent ?? '').includes(spec.text ?? '')) : undefined
          return button ? button.classList.contains('on') : false
        }
        return [...document.querySelectorAll(spec.selector)].some(
          (el) => isVisible(el) && (spec.text == null || (el.textContent ?? '').includes(spec.text))
        )
      }
      return new Promise((resolve, reject) => {
        let finished = false
        const started = performance.now()
        const finish = (fn, value) => {
          if (finished) return
          finished = true
          window.clearTimeout(timer)
          observer.disconnect()
          fn(value)
        }
        const timer = window.setTimeout(() => finish(reject, new Error(`in-page measure timeout: ${spec.clickLabel}`)), spec.timeoutMs ?? 10_000)
        const observer = new MutationObserver(() => { if (probe()) finish(resolve, Math.round(performance.now() - started)) })
        observer.observe(document.body, { childList: true, subtree: true, attributes: spec.kind === 'classOn' })
        const findButton = () => [...document.querySelectorAll('.sec-btn')].find((el) => {
          const haystack = [el.textContent ?? '', el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? '']
          return haystack.some((value) => value.includes(spec.clickLabel))
        })
        // D5-Nav-Reduktion: Zweitbereiche (Hilfe/System/...) liegen im
        // „Mehr"-Menue. Das Menue rendert erst asynchron nach dem Oeffner-
        // Klick, daher ein kurzer Retry statt synchroner Nachsuche.
        let menuTried = false
        const attempt = () => {
          const found = findButton()
          if (!(found instanceof HTMLElement)) {
            if (!menuTried) {
              menuTried = true
              const more = document.querySelector('.sec-btn.nav-more')
              if (more instanceof HTMLElement) {
                more.click()
                window.setTimeout(attempt, 150)
                return
              }
            }
            finish(reject, new Error(`control not found: ${spec.clickLabel}`))
            return
          }
          found.click()
          if (probe()) finish(resolve, Math.round(performance.now() - started))
          else requestAnimationFrame(() => { if (probe()) finish(resolve, Math.round(performance.now() - started)) })
        }
        attempt()
      })
    }
  })
}

// EINE Messung = EIN Roundtrip: installiert den Helfer bei Bedarf und misst.
export async function measureInPageMs(win, spec) {
  await installInPageMeasure(win)
  return win.evaluate((s) => window.__perfMeasureClick(s), spec)
}

// ── LEGACY (Festwarte — unveraendert fuer vorher-baseline.mjs) ───────────────

export async function navByText(win, selector, text, waitMs = 350) {
  const started = Date.now()
  await win.evaluate(({ selector, text }) => {
    const controls = [...document.querySelectorAll(selector)]
    const found = controls.find((el) => {
      const visibleText = el.textContent ?? ''
      const label = el.getAttribute('aria-label') ?? ''
      const title = el.getAttribute('title') ?? ''
      return [visibleText, label, title].some((value) => value.includes(text))
    })
    if (!(found instanceof HTMLElement)) throw new Error(`control not found: ${text}`)
    found.click()
  }, { selector, text })
  await win.waitForTimeout(waitMs)
  return Date.now() - started
}

export async function visibleCount(win, selector) {
  return win.evaluate((selector) => document.querySelectorAll(selector).length, selector).catch(() => 0)
}

export async function scrollMetric(win) {
  return win.evaluate(() => {
    const el = document.querySelector('.main') ?? document.scrollingElement
    const before = el?.scrollTop ?? 0
    el?.scrollBy?.(0, 600)
    const after = el?.scrollTop ?? 0
    return { before, after, delta: after - before, height: el?.scrollHeight ?? 0 }
  })
}

export async function appTextLength(win) {
  return win.evaluate(() => document.body?.innerText?.trim().length ?? 0)
}
