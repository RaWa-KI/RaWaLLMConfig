import { writeFileSync } from 'node:fs'

export function buildAuditDump({ headCommit, bridge, uiChecks }) {
  return {
    generatedAt: new Date().toISOString(),
    headCommit,
    round: 3,
    families: bridge.configMeta.families ?? { _error: bridge.configMeta._error ?? bridge.configMeta._evalError },
    llmDefs: bridge.configMeta.llms ?? [],
    dupes: bridge.dupesResult.dupes ?? [],
    readFullSamples: bridge.readFullResult.samples ?? [],
    system: bridge.systemResult._evalError ? { summary: null, error: bridge.systemResult._evalError } : { summary: bridge.systemResult, error: bridge.systemResult._error ?? null },
    watcher: bridge.watcherResult._evalError ? { error: bridge.watcherResult._evalError } : { ...bridge.watcherResult, error: bridge.watcherResult._error ?? null },
    struktur: bridge.strukturResult._evalError ? { error: bridge.strukturResult._evalError } : { ...bridge.strukturResult, error: bridge.strukturResult._error ?? null },
    explainSamples: bridge.explainResult.samples ?? [],
    fsCounts: bridge.fsCounts,
    uiChecks
  }
}

export function verifyAuditDump({ dump, dumpPath }) {
  const verif = { a: false, b: false, c: false, anomalies: [] }
  const familyIds = Object.keys(dump.families ?? {}).filter((k) => !k.startsWith('_'))
  verif.a = familyIds.some((fid) => (dump.families[fid]?.categoryCount ?? 0) > 0)
  const leaks = checkNoSecretStrings(dump)
  verif.b = leaks.length === 0
  if (!verif.b) verif.anomalies.push(...leaks)
  verif.c = Object.entries(dump.uiChecks ?? {}).filter(([, v]) => !v.result).length === 0
  collectAnomalies(dump, familyIds, verif)
  const leakHits = (dump.readFullSamples ?? []).filter((s) => s.leakPatternHit === true && s.masked === false)
  const matrix = buildPassMatrix(dump, leaks, leakHits)
  const passCount = matrix.filter((m) => m.pass).length
  const allPass = verif.a && verif.b && verif.c && passCount === matrix.length
  dump._passMatrix = matrix
  dump._verification = { ...verif, allPass, passCount, totalChecks: matrix.length, leakPatternHits: leakHits.map((s) => s.path) }
  writeFileSync(dumpPath, JSON.stringify(dump, null, 2), 'utf8')
  printMatrix(matrix, dump, familyIds, verif)
  return { allPass, passCount }
}

function checkNoSecretStrings(obj, path = '') {
  const bad = []
  if (obj === null || obj === undefined || typeof obj !== 'object') return bad
  for (const [k, v] of Object.entries(obj)) {
    const p = `${path}.${k}`
    if (['content', 'code', 'value'].includes(k) && typeof v === 'string' && v.length > 0) bad.push(`SANITIERUNGS-LEAK: ${p} = string(${v.length})`)
    if (typeof v === 'object' && v !== null) bad.push(...checkNoSecretStrings(v, p))
  }
  return bad
}

function collectAnomalies(parsed, familyIds, verif) {
  if (!verif.a) verif.anomalies.push('Keine Familien mit Kategorien')
  if (!verif.c) verif.anomalies.push('uiChecks ohne result-Status')
  for (const fid of familyIds) {
    const fd = parsed.families[fid]
    if ((fd?.categoryCount ?? 0) === 0) verif.anomalies.push(`Familie ${fid}: 0 Kategorien`)
    const empty = (fd?.categories ?? []).filter((c) => c.entryCount === 0).map((c) => c.id)
    if (empty.length) verif.anomalies.push(`Familie ${fid}: leere Kategorien: ${empty.join(', ')}`)
  }
  for (const s of (parsed.readFullSamples ?? []).filter((x) => !x.ok).slice(0, 10)) verif.anomalies.push(`readFull FAIL: ${s.path} -> ${s.errorReason}`)
  for (const key of ['struktur', 'system', 'watcher']) if (parsed[key]?.error) verif.anomalies.push(`${key}: ${parsed[key].error}`)
}

function buildPassMatrix(parsed, leaks, leakHits) {
  const samples = parsed.readFullSamples ?? []
  const secretSamples = samples.filter((s) => s.path && ['settings.json', 'settings.local.json', '.claude.json', 'config.toml'].some((x) => s.path.endsWith(x)))
  const pflichtOk = secretSamples.filter((s) => s.ok && s.masked === true)
  const pflichtOkWithCount = secretSamples.filter((s) => s.ok && s.masked === true && s.maskedCount > 0)
  const c2d = parsed.uiChecks?.C2?.detail ?? {}
  const claudeFam = parsed.families?.claude
  const pluginsCat = (claudeFam?.categories ?? []).find((c) => c.id === 'plugins')
  const hooksCat = (claudeFam?.categories ?? []).find((c) => c.id === 'hooks')
  const sharedFam = parsed.families?.shared
  const sharedHooksCat = (sharedFam?.categories ?? []).find((c) => c.id?.includes('hooks') || c.label?.toLowerCase().includes('hooks'))
  const sharedPluginsCat = (sharedFam?.categories ?? []).find((c) => c.id?.includes('plugins') || c.label?.toLowerCase().includes('plugins'))
  const explain = parsed.explainSamples ?? []
  const explainOk = ['team', 'instruction', 'local'].every((k) => explain.find((s) => s.cat === k || s.kindPassed === k)?.isGeneric === false)
  const dupeCount = parsed.dupes?.length ?? 0
  const hooksCount = hooksCat?.entryCount ?? 0
  const pluginsCount = pluginsCat?.entryCount ?? 0
  return [
    row(1, 'settings.json: ok+masked+maskedCount>0', pflichtOkWithCount.some((s) => s.path.endsWith('settings.json')), `${pflichtOkWithCount.filter((s) => s.path.endsWith('settings.json')).length}/${secretSamples.filter((s) => s.path.endsWith('settings.json')).length}`),
    row(2, 'settings.local/.claude/config.toml: masked+ok', ['settings.local.json', '.claude.json', 'config.toml'].every((sfx) => secretSamples.filter((s) => s.path.endsWith(sfx)).every((s) => s.ok && s.masked)), `${pflichtOk.length}/${secretSamples.length}`),
    row(3, 'Hooks-Eintrag: ConfigTab zeigt Inhalt', parsed.uiChecks?.C5?.passMatrix3 === true, `hasCodeblock=${parsed.uiChecks?.C5?.detail?.configTab?.hasCodeblock}`),
    row(4, 'Settings-Eintrag: SecretCard + Toggle', parsed.uiChecks?.C6?.passMatrix4?.hasSecretCard && parsed.uiChecks?.C6?.passMatrix4?.hasToggleButton, JSON.stringify(parsed.uiChecks?.C6?.passMatrix4 ?? {})),
    row(5, 'duplicateCount>0 + agent-routing-Paar', dupeCount > 0 && parsed.dupes.some((d) => d.name?.toLowerCase().includes('agent-routing')), `dupeCount=${dupeCount}`),
    row(6, 'Konflikte-Chip Treffer == Bridge', c2d.trefferVsChip?.match === true || !c2d.chipFound, c2d.chipFound ? JSON.stringify(c2d.trefferVsChip) : 'kein Konflikt-Chip'),
    row(7, 'Struktur-Sektion erreichbar', parsed.uiChecks?.C7?.result === 'PASS' && parsed.uiChecks?.C7?.detail?.btnFound === true, `btnFound=${parsed.uiChecks?.C7?.detail?.btnFound}`),
    row(8, 'changelogCount>0', (parsed.watcher?.changelogCount ?? 0) > 0, `changelogCount=${parsed.watcher?.changelogCount ?? 0}`),
    row(9, 'struktur ohne Parallelbaeume/.git/node_modules', parsed.struktur?.dupeHasParallelTrees === false && parsed.struktur?.warnHasGitOrModules === false, `dupe=${parsed.struktur?.dupeHasParallelTrees}, warn=${parsed.struktur?.warnHasGitOrModules}`),
    row(10, 'claude plugins/hooks + shared code', pluginsCount >= 30 && hooksCount >= 3 && (hooksCat?.entries ?? []).some((e) => /\.(cjs|sh|ps1)$/.test(e.path ?? '')) && ((sharedHooksCat?.entries ?? []).some((e) => e.hasCode) || (sharedPluginsCat?.entries ?? []).some((e) => e.hasCode)), `plugins=${pluginsCount}, hooks=${hooksCount}`),
    row(11, 'explain team/instruction/local nicht GENERIC', explainOk, `samples=${explain.length}`),
    row(12, 'Dump-Sanitisierungs-Gate PASS', leaks.length === 0, `leaks=${leaks.length}, leakPatternHits=${leakHits.length}`)
  ]
}

function row(nr, check, pass, evidenz) {
  return { nr, check, pass: Boolean(pass), evidenz }
}

function printMatrix(matrix, parsed, familyIds, verif) {
  console.log('\n[audit-probe] -- PASS-MATRIX WP-10 --')
  for (const m of matrix) console.log(`  [${m.pass ? 'PASS' : 'FAIL'}] Punkt ${m.nr}: ${m.check}\n         Evidenz: ${m.evidenz}`)
  console.log(`\n  GESAMT: ${matrix.filter((m) => m.pass).length}/${matrix.length} PASS`)
  console.log('\n[audit-probe] -- Zaehler je Familie --')
  for (const fid of familyIds) {
    const fd = parsed.families[fid]
    const count = (status) => (fd?.categories ?? []).reduce((s, c) => s + c.entries.filter((e) => e.status === status).length, 0)
    console.log(`  ${fid}: aktiv=${count('active')}, dup=${fd?.duplicateCount ?? 0}, veraltet=${count('stale')}, konflikt=${count('conflict')}`)
  }
  if (verif.anomalies.length > 0) {
    console.log('\n[audit-probe] -- Anomalien --')
    for (const a of verif.anomalies) console.log(`  !  ${a}`)
  }
}
