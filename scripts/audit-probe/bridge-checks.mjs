const LEAK_RX = /sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY(?!-----)[\s]*[^•]/

export async function runBridgeChecks({ safeEval, buildFsCounts }) {
  const configMeta = await readConfigMeta(safeEval)
  const dupesResult = await readDupes(safeEval)
  const readFullResult = await readFullSamples(safeEval)
  const systemResult = await readSystem(safeEval)
  const watcherResult = await readWatcher(safeEval)
  const strukturResult = await readStruktur(safeEval)
  const explainResult = await readExplain(safeEval)
  return { configMeta, dupesResult, readFullResult, systemResult, watcherResult, strukturResult, explainResult, fsCounts: buildFsCounts() }
}

function readConfigMeta(safeEval) {
  return safeEval(() => {
    const api = window.electronAPI
    if (!api) return { _error: 'electronAPI nicht verfuegbar' }
    return api.readConfig().then((r) => {
      if (!r.data) return { _error: r.error }
      const families = {}
      for (const [fid, cfg] of Object.entries(r.data.data ?? {})) {
        families[fid] = {
          categoryCount: cfg.categories?.length ?? 0,
          duplicateCount: cfg.duplicates?.length ?? 0,
          categories: (cfg.categories ?? []).map((cat) => ({
            id: cat.id, label: cat.label, entryCount: cat.entries?.length ?? 0,
            entries: (cat.entries ?? []).map((e) => ({
              name: e.name, path: e.path, status: e.status, kind: e.scope,
              hasCode: Boolean(e.code), codeLength: e.code?.length ?? 0,
              hasFields: Boolean(e.fields && Object.keys(e.fields).length > 0),
              fieldKeys: Object.keys(e.fields ?? {}), descLength: e.desc?.length ?? 0
            }))
          }))
        }
      }
      const llms = (r.data.llms ?? []).map((l) => ({ id: l.id, name: l.name }))
      return { families, snapshot: r.data.snapshot, machineCount: r.data.machines?.length ?? 0, llmCount: llms.length, llms }
    }).catch((e) => ({ _error: String(e) }))
  }, 'readConfig')
}

function readDupes(safeEval) {
  return safeEval(() => {
    const api = window.electronAPI
    if (!api) return { _error: 'electronAPI nicht verfuegbar' }
    return api.readConfig().then((r) => {
      if (!r.data) return { _error: r.error }
      const dupes = []
      for (const [fid, cfg] of Object.entries(r.data.data ?? {})) {
        for (const d of (cfg.duplicates ?? [])) {
          dupes.push({ family: fid, cat: d.cat, name: d.name, verdict: d.verdict, pathA: d.trunk?.path ?? null, pathB: d.mirror?.path ?? null })
        }
      }
      return { dupes }
    }).catch((e) => ({ _error: String(e) }))
  }, 'dupes')
}

function readFullSamples(safeEval) {
  return safeEval(async (leakRxSrc) => {
    const api = window.electronAPI
    if (!api?.readFull) return { _error: 'readFull nicht verfuegbar' }
    const cfg = await api.readConfig().catch(() => ({ data: null }))
    if (!cfg.data) return { _error: 'config nicht geladen' }
    const leakRx = new RegExp(leakRxSrc)
    const allEntries = []
    for (const [fid, lcfg] of Object.entries(cfg.data.data ?? {})) {
      for (const cat of (lcfg.categories ?? [])) {
        for (const e of (cat.entries ?? []).slice(0, 2)) if (e.path) allEntries.push({ family: fid, cat: cat.id, path: e.path })
      }
    }
    const must = allEntries.filter((e) => e.path.endsWith('settings.json') || e.path.endsWith('settings.local.json') || e.path.endsWith('.claude.json') || e.path.endsWith('config.toml'))
    const combined = [...must, ...allEntries.filter((e) => !must.includes(e))].slice(0, 30)
    const samples = []
    for (const item of combined) samples.push(await sampleReadFull(api, item, leakRx))
    return { samples }
  }, 'readFull', LEAK_RX.source)
}

async function sampleReadFull(api, item, leakRx) {
  try {
    const r = await api.readFull({ path: item.path })
    const content = r.data?.content ?? null
    const masked = r.data?.masked ?? false
    return {
      family: item.family, cat: item.cat, path: item.path, ok: Boolean(r.data), errorReason: r.error ?? null,
      contentLength: content?.length ?? null, masked, maskedCount: r.data?.maskedCount ?? 0,
      contentHasMaskChar: typeof content === 'string' && content.includes('•'),
      leakPatternHit: masked === false && typeof content === 'string' && leakRx.test(content),
      credentialCount: r.data?.credential ? 1 : 0, hasCredentialMeta: Boolean(r.data?.credential),
      credentialHasSecret: r.data?.credential?.hasSecret ?? null, credentialKind: r.data?.credential?.secretKind ?? null
    }
  } catch (error) {
    return { family: item.family, cat: item.cat, path: item.path, ok: false, errorReason: String(error), contentLength: null, masked: false, maskedCount: 0, contentHasMaskChar: false, leakPatternHit: false, credentialCount: 0, hasCredentialMeta: false, credentialHasSecret: null, credentialKind: null }
  }
}

function readSystem(safeEval) {
  return safeEval(() => window.electronAPI?.readSystem().then((r) => {
    if (!r.data) return { _error: r.error }
    return { updated: r.data.updated, areaCount: r.data.areas?.length ?? 0, areas: (r.data.areas ?? []).map((a) => ({ id: a.id, label: a.label, entryCount: a.entries?.length ?? 0, fieldKeys: [...new Set((a.entries ?? []).flatMap((e) => Object.keys(e.fields ?? {})))] })) }
  }).catch((e) => ({ _error: String(e) })) ?? { _error: 'kein api' }, 'system')
}

function readWatcher(safeEval) {
  return safeEval(() => window.electronAPI?.readWatcher().then((r) => {
    if (!r.data) return { _error: r.error }
    return { sourceCount: r.data.sources?.length ?? 0, sources: (r.data.sources ?? []).map((s) => ({ name: s.name, hasLatest: Boolean(s.latest), hasPath: Boolean(s.path), state: s.state })), changelogCount: r.data.changelogs?.length ?? 0, tierCount: r.data.tiers?.length ?? 0, daemon: { status: r.data.daemon?.status ?? null, hasSchedule: Boolean(r.data.daemon?.schedule) } }
  }).catch((e) => ({ _error: String(e) })) ?? { _error: 'kein api' }, 'watcher')
}

function readStruktur(safeEval) {
  return safeEval(async () => {
    const api = window.electronAPI
    if (!api?.strukturScan) return { _error: 'strukturScan nicht in Bridge' }
    const r = await api.strukturScan({}).catch((e) => ({ data: null, error: String(e) }))
    if (!r.data) return { _error: r.error }
    const findings = r.data.findings ?? []
    const counts = { ok: 0, warn: 0, misplaced: 0, duplicate: 0 }
    for (const f of findings) if (f.status in counts) counts[f.status]++
    const warnPaths = findings.filter((f) => f.status === 'warn').map((f) => f.path ?? '')
    const dupePaths = findings.filter((f) => f.status === 'duplicate').map((f) => f.path ?? '')
    return { totalFindings: findings.length, counts, warnHasGitOrModules: warnPaths.some((p) => p.includes('.git') || p.includes('node_modules')), dupeHasParallelTrees: dupePaths.some((p) => p.includes('.codex') || (p.includes('.shared') && p.includes('.claude'))), scannedRoots: r.data.scannedRoots ?? [], truncated: r.data.truncated ?? false, paths: findings.map((f) => ({ path: f.path, status: f.status, kind: f.kind })) }
  }, 'strukturScan')
}

function readExplain(safeEval) {
  return safeEval(async () => {
    const api = window.electronAPI
    if (!api?.explain) return { _error: 'explain nicht in Bridge', samples: [] }
    const cfg = await api.readConfig().catch(() => ({ data: null }))
    if (!cfg.data) return { samples: [] }
    const samples = []
    for (const kind of ['team', 'instruction', 'local']) samples.push(await explainOne(api, kind, 'test-entry'))
    for (const [fid, lcfg] of Object.entries(cfg.data.data ?? {}).slice(0, 3)) {
      for (const cat of (lcfg.categories ?? []).slice(0, 2)) {
        const first = cat.entries?.[0]
        if (first) samples.push(await explainOne(api, `${fid}-${cat.id}`, first.name, fid, cat.id))
      }
    }
    return { samples }
  }, 'explain')
}

async function explainOne(api, kind, name, family = kind === 'local' ? 'local' : 'claude', cat = kind) {
  try {
    const r = await api.explain({ kind, name })
    const text = r.data?.text?.toLowerCase() ?? ''
    return { family, cat, kindPassed: kind, ok: Boolean(r.data), errorReason: r.error ?? null, titleLength: r.data?.title?.length ?? 0, textLength: r.data?.text?.length ?? 0, isGeneric: !r.data || text.includes('generic') || text.includes('allgemeiner eintrag') || !text }
  } catch (error) {
    return { family, cat, kindPassed: kind, ok: false, errorReason: String(error), isGeneric: true }
  }
}
