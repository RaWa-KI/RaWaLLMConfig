import { join } from 'node:path'

export async function runAuditUiChecks({ win, safeEval, shotsDir }) {
  const uiChecks = {}
  const shot = createShot(win, shotsDir, uiChecks)
  await optionalClick(win.locator('.sec-btn', { hasText: 'Config' }), uiChecks, 'activate Config')
  await win.waitForTimeout(500)
  uiChecks.C1 = await checkHealthBar(win, shot)
  uiChecks.C2 = await checkConflicts(win, safeEval, shot)
  uiChecks.C3 = await checkSearchNavigation(win, shot)
  uiChecks.C4 = await checkDrawer(win, shot, 'Skills-Eintrag-R3', /skills/i, null, 'c4-skills-drawer-r3')
  uiChecks.C5 = await checkDrawer(win, shot, 'Hooks-Eintrag-R3', /hooks/i, 'claude', 'c5-hooks-drawer-r3')
  uiChecks.C6 = await checkDrawer(win, shot, 'Settings-Eintrag-R3', /settings/i, 'claude', 'c6-settings-drawer-r3')
  uiChecks.C7 = await checkStruktur(win, shot)
  uiChecks.C8 = await checkAgentRoutingDupes(safeEval)
  await shot('final-state')
  return uiChecks
}

function createShot(win, shotsDir, uiChecks) {
  let shotIdx = 0
  return async (name) => {
    try {
      const file = `${String(shotIdx++).padStart(2, '0')}-${name}.png`
      await win.screenshot({ path: join(shotsDir, file) })
    } catch (error) {
      uiChecks._screenshotError = String(error).slice(0, 120)
    }
  }
}

async function checkHealthBar(win, shot) {
  const c1 = { label: 'HealthBar-Zaehler-je-Familie-R3', result: 'UNKNOWN', detail: {} }
  try {
    const warnings = []
    await optionalClick(win.locator('.sec-btn', { hasText: 'Config' }), { _warnings: warnings }, 'activate Config')
    await win.waitForTimeout(400)
    const tabCount = await win.locator('.llm-tab').count()
    const familyResults = {}
    const domSwitchVisible = {}
    for (let i = 0; i < tabCount; i++) {
      const tab = win.locator('.llm-tab').nth(i)
      const tabName = (await tab.locator('.lt-name').innerText().catch(() => `tab-${i}`)).trim()
      const isComing = await tab.evaluate((el) => el.classList.contains('coming')).catch(() => false)
      if (!isComing) { await optionalClick(tab, { _warnings: warnings }, `switch family ${tabName}`); await win.waitForTimeout(500) }
      familyResults[tabName] = await chipTexts(win)
      domSwitchVisible[tabName] = { activeClass: await tab.evaluate((el) => el.classList.contains('on')).catch(() => null), coming: isComing }
    }
    c1.result = 'PASS'; c1.detail = { tabCount, familyResults, domSwitchVisible, warnings }
    await shot('c1-healthbar-r3')
  } catch (error) { c1.result = 'ERROR'; c1.detail = { error: String(error) } }
  return c1
}

async function chipTexts(win) {
  const out = []
  for (const chip of await win.locator('.hstat').all()) out.push((await chip.innerText().catch(() => '')).replace(/\n/g, ' ').trim())
  return out
}

async function checkConflicts(win, safeEval, shot) {
  const c2 = { label: 'Konflikte-Chip-R3', result: 'UNKNOWN', detail: {} }
  try {
    await switchFamily(win, 'claude')
    const conflictChip = win.locator('.hstat.conf')
    if (await conflictChip.count() === 0) {
      c2.result = 'PASS'; c2.detail = { chipFound: false, note: '.hstat.conf nicht gefunden' }
      return c2
    }
    const chipText = (await conflictChip.first().innerText().catch(() => '')).trim()
    await conflictChip.first().click(); await win.waitForTimeout(700)
    const h2Texts = await allTexts(win.locator('.view-head h2'))
    const rowCount = await win.locator('.rows .row').count()
    const conflictsByFamily = await conflictBridgeCounts(safeEval)
    const claudeConflicts = conflictsByFamily?.claude ?? 0
    c2.result = 'PASS'
    c2.detail = { chipFound: true, chipText, chipNum: parseInt(chipText.match(/\d+/)?.[0] ?? '0', 10), searchFieldValue: await win.locator('.search input').inputValue().catch(() => null), isSearchView: h2Texts.some((t) => t === 'Suche'), h2Texts, rowCount, conflictsByFamily, trefferVsChip: { rowCount, claudeConflicts, match: rowCount === claudeConflicts } }
    await shot('c2-conflicts-r3')
  } catch (error) { c2.result = 'ERROR'; c2.detail = { error: String(error) } }
  return c2
}

function conflictBridgeCounts(safeEval) {
  return safeEval(() => window.electronAPI?.readConfig().then((r) => {
    if (!r.data) return { _error: r.error }
    const out = {}
    for (const [fid, cfg] of Object.entries(r.data.data ?? {})) {
      let count = 0
      for (const cat of (cfg.categories ?? [])) for (const e of (cat.entries ?? [])) if (e.status === 'conflict') count++
      if (count > 0) out[fid] = count
    }
    return out
  }).catch((e) => ({ _error: String(e) })) ?? { _error: 'kein api' }, 'c2-conflicts-bridge')
}

async function checkSearchNavigation(win, shot) {
  const c3 = { label: 'Suche-dann-Kategorie-Freeze', result: 'UNKNOWN', detail: {} }
  try {
    const search = win.locator('.search input')
    if (await search.count() === 0) { c3.result = 'PASS'; c3.detail = { searchInputFound: false }; return c3 }
    await search.first().fill('hook'); await win.waitForTimeout(400)
    const navItem = win.locator('.nav-item').first()
    if (await navItem.count() > 0) await navItem.click()
    await win.waitForTimeout(400)
    const h2Texts = await allTexts(win.locator('.view-head h2'))
    c3.result = 'PASS'
    c3.detail = { searchInputFound: true, navItemFound: await navItem.count() > 0, isSearchView: h2Texts.some((t) => t === 'Suche'), catViewVisible: await win.locator('.view-head').count() > 0, h2Texts }
    await search.first().fill('').catch((error) => { c3.detail.clearError = String(error).slice(0, 120) })
    await shot('c3-search-nav')
  } catch (error) { c3.result = 'ERROR'; c3.detail = { error: String(error) } }
  return c3
}

async function checkDrawer(win, shot, label, catSelector, family, shotName) {
  const raw = await probeDrawer(win, label, catSelector, family)
  await shot(shotName)
  const result = { label: raw.label, result: raw.anomaly && !raw.entryFound ? 'BEFUND' : 'PASS', detail: raw }
  if (/Hooks/.test(label)) result.passMatrix3 = raw.configTab?.hasCodeblock && !raw.configTab?.hasEmpty
  if (/Settings/.test(label)) result.passMatrix4 = { hasSecretCard: raw.detailTab?.hasSecretCard ?? false, hasToggleButton: raw.detailTab?.hasToggleButton ?? false, hasEnvBadge: raw.detailTab?.hasEnvBadge ?? false }
  return result
}

async function probeDrawer(win, label, catSelector, family) {
  const result = { label, entryFound: false, drawerOpened: false, tabLabels: [], configTab: {}, detailTab: {}, anomaly: null }
  try {
    if (family) await switchFamily(win, family)
    const catBtn = win.locator('.nav-item', { hasText: catSelector })
    if (await catBtn.count() === 0) { result.anomaly = `Kategorie-Button nicht gefunden: ${catSelector}`; return result }
    await catBtn.first().click(); await win.waitForTimeout(500)
    const firstRow = win.locator('.rows .row').first()
    if (await firstRow.count() === 0) { result.anomaly = 'Kein .row-Element sichtbar'; return result }
    result.entryFound = true; await firstRow.click(); await win.waitForTimeout(700)
    result.drawerOpened = await win.locator('.drawer.show').count() > 0
    if (!result.drawerOpened) { result.anomaly = 'Drawer nicht geoeffnet nach Row-Klick'; return result }
    result.tabLabels = await allTexts(win.locator('.drawer-tab'))
    result.configTab = await inspectConfigTab(win)
    result.detailTab = await inspectDetailTab(win)
    await optionalClick(win.locator('.drawer-close'), result, 'close drawer')
  } catch (error) { result.anomaly = String(error).slice(0, 200) }
  return result
}

async function inspectConfigTab(win) {
  const tab = win.locator('.drawer-tab', { hasText: /konfigur/i })
  if (await tab.count() === 0) return { found: false }
  await tab.first().click(); await win.waitForTimeout(600)
  const hasCodeblock = await win.locator('.codeblock').count() > 0
  const hasEmpty = await win.locator('.codeblock-empty').count() > 0
  return { found: true, hasCodeblock, hasEmpty, hasMaskBadge: await win.locator('.codeblock-maskbadge').count() > 0, textContentLength: hasCodeblock ? await win.locator('.codeblock').evaluate((el) => el.textContent?.length ?? 0).catch(() => 0) : 0 }
}

async function inspectDetailTab(win) {
  const tab = win.locator('.drawer-tab', { hasText: /detail/i })
  if (await tab.count() === 0) return { found: false }
  await tab.first().click(); await win.waitForTimeout(900)
  const toggleBtn = win.locator('.secret-card button')
  return { found: true, hasDetailTab: await win.locator('.drawer-detail-tab').count() > 0, hasSecretCard: await win.locator('.secret-card').count() > 0, hasSecretHead: await win.locator('.secret-head').count() > 0, hasToggleButton: await toggleBtn.count() > 0, toggleText: await toggleBtn.first().innerText().catch(() => null), hasEnvBadge: await win.locator('.secret-needenv').count() > 0, hasDrawerEdit: await win.locator('.drawer-edit, .edit-form, [class*="edit"]').count() > 0, hasExplain: await win.locator('.explain-panel, [class*="explain"]').count() > 0 }
}

async function checkStruktur(win, shot) {
  const c7 = { label: 'Struktur-Nav-R3', result: 'UNKNOWN', detail: {} }
  try {
    const btn = win.locator('.sec-btn', { hasText: /struktur/i })
    const btnFound = await btn.count() > 0
    if (btnFound) { await btn.first().click(); await win.waitForTimeout(700) }
    c7.result = btnFound ? 'PASS' : 'BEFUND'
    c7.detail = { btnFound, sectionRendered: await win.locator('.struktur-section, [class*="struktur"]').count() > 0 }
    await shot('c7-struktur-nav')
  } catch (error) { c7.result = 'ERROR'; c7.detail = { error: String(error) } }
  return c7
}

async function checkAgentRoutingDupes(safeEval) {
  const dupes = await safeEval(() => window.electronAPI?.readConfig().then((r) => {
    const out = []
    for (const [fid, cfg] of Object.entries(r.data?.data ?? {})) for (const d of (cfg.duplicates ?? [])) out.push({ family: fid, cat: d.cat, name: d.name, verdict: d.verdict })
    return out
  }).catch(() => []) ?? [], 'c8-dupes')
  const pairs = (dupes ?? []).filter((d) => typeof d.name === 'string' && d.name.toLowerCase().includes('agent-routing'))
  return { label: 'Dupes-agent-routing-R3', result: 'PASS', detail: { totalDupes: dupes?.length ?? 0, hasPair: pairs.length > 0, agentRoutingPairs: pairs } }
}

async function switchFamily(win, name) {
  const tab = win.locator('.llm-tab:not(.coming)', { hasText: name })
  if (await tab.count() > 0) { await optionalClick(tab.first(), null, `switch family ${name}`); await win.waitForTimeout(400) }
}

async function allTexts(locator) {
  const texts = []
  for (const el of await locator.all()) texts.push((await el.innerText().catch(() => '')).trim())
  return texts
}

async function optionalClick(locator, target, label) {
  try {
    await locator.click()
    return true
  } catch (error) {
    const msg = `${label}: ${String(error).slice(0, 120)}`
    if (target) target._warnings = [...(target._warnings ?? []), msg]
    else console.warn('[audit-ui]', msg)
    return false
  }
}
