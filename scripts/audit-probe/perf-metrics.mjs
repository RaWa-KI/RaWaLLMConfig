export function nowMs() {
  return Math.round(performance.now())
}

export async function navByText(win, selector, text, waitMs = 350) {
  const started = Date.now()
  await win.evaluate(({ selector, text }) => {
    const controls = [...document.querySelectorAll(selector)]
    const found = controls.find((el) => el.textContent?.includes(text))
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
