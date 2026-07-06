// secret-guard.spec.ts — Read/Write-Split-Tests (P1-Fix) + readFull-Anzeige-
// Verhalten (Owner-Override). Zwei Strengen ueber einer Basis: isSecretPathForRead
// (NUR echte Secret-WERT-Klassen, Doku sichtbar) und isSecretPathForWrite (= ForRead
// ODER Basename-Wortheuristik, paranoid). Garantie ForWrite ⊇ ForRead wird
// mitgeprueft. Der zweite Block prueft das NEUE Read-Seite-Verhalten: Secret-Klasse
// wird MASKIERT angezeigt (nicht mehr hart geblockt), reveal liefert roh + Audit
// 'readfull-reveal' (nur Pfad). Read-Verhalten nutzt dieselbe Komposition wie
// buildReadFullResult (isSecretPathForRead + maskSecrets bzw. reveal + appendAudit).
// Write-Seite (assertWritable) ist per DEFAULT strikt: secret-bearing -> geblockt,
// damit Bulk-/Ordner-/Reconcile-/Rename-/Move-Pfade secret-skip behalten. NUR mit
// dem expliziten Opt-in `{ ownerEdit: true }` UND aktivem Schreibmodus ist die
// Secret-Klasse owner-schreibbar (Owner-Override [[app-zeigt-secrets-lokal-owner-override]],
// nur fuer den owner-initiierten Einzeldatei-Content-Edit).
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  assertWritable,
  isSecretPathForRead,
  isSecretPathForWrite,
  SECRET_DENY_REASON
} from '../../src/main/services/secret-guard'
import { maskSecrets } from '../../src/main/services/secret-mask'
import { setWriteEnabledRuntime } from '../../src/main/services/write-mode'
import { appendAudit, makeAuditEntry } from '../../src/main/services/audit-log'
import { applyWrite, applyDirAction } from '../../src/main/services/apply'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox, seedFile, sandboxPath, exists } from './fixtures'

// Schreibmodus deterministisch setzen (In-App-Toggle) fuer die ownerEdit-Tests.
// null = zurueck auf Env-Fallback.
function withWriteMode(on: boolean | null, fn: () => void): void {
  setWriteEnabledRuntime(on)
  try {
    fn()
  } finally {
    setWriteEnabledRuntime(null)
  }
}

// Defensive Test-Isolation: jeden Test mit neutralem runtimeFlag (Env-Fallback)
// starten, falls ein paralleler Spec im selben Worker den globalen In-App-Toggle
// gesetzt zurueckgelassen hat (Flaky-Schutz, vgl. write-mode.spec Cache-Restore).
test.beforeEach(() => setWriteEnabledRuntime(null))

// Echte Secret-WERT-Dateien: BEIDE Seiten (read UND write) secret-bearing.
const SECRET_VALUE_PATHS = [
  '/home/u/.claude/settings.json',
  '/home/u/.claude/settings.local.json',
  '/home/u/.claude/settings.prod.json',
  '/home/u/.claude.json',
  '/home/u/.claude/.credentials.json',
  '/home/u/.codex/auth.json',
  '/home/u/.codex/config.toml',
  '/home/u/.codex/state.sqlite',
  '/home/u/.codex/state.sqlite3',
  '/home/u/.codex/installation_id',
  '/home/u/.codex/.sandbox-secrets',
  '/home/u/.codex/codex-global-state',
  '/home/u/.codex/codex-global-state.json',
  '/home/u/x/token.secret',
  '/home/u/.shared/x/credentials/key-list.md', // /credentials/-Segment
  '/home/u/.shared/x/security/policy.md', // /security/-Segment
  '/home/u/x/api.env',
  '/home/u/x/private.key',
  '/home/u/x/cert.pem',
  '/home/u/x/.env'
]

// Nicht-Markdown mit Secret-Wort im Basename: READ-sichtbar (ForRead === false),
// aber WRITE-verweigert (ForWrite === true, Basename-Wortheuristik greift weiter,
// da KEIN .md/.markdown/.mdx). Testet den paranoiden Wort-Heuristik-Guard fuer
// echte Nicht-Doc-Faelle: .txt (Policy-Notiz) + .json (Secret-Wort im Namen, aber
// keine Secret-WERT-Klasse -> ForRead false, ForWrite true via Wortheuristik).
const READ_VISIBLE_PATHS = [
  '/home/u/.claude/password-policy.txt',
  '/home/u/x/secrets-backup.json'
]

// Markdown-Doku mit Secret-Wort im Basename: voll verwaltbar (Owner-Override
// [[app-zeigt-secrets-lokal-owner-override]]). ForRead === false UND ForWrite ===
// false — die paranoide Basename-Wortheuristik wird fuer .md/.markdown/.mdx
// uebersprungen, damit Policy-/Rules-/Agent-Docs editierbar UND reconcilebar sind.
// Echte Secret-WERT-Dateien (json/toml/env/key/pem/sqlite + /credentials//security/)
// sind nie .md -> hier nicht enthalten, werden nicht geschwaecht.
const DOC_EDITABLE_PATHS = [
  '/home/u/.shared/.claude/rules/credentials-protection.md',
  '/home/u/.shared/.claude/plugins/rkwc-php-stack/agents/security-agent.md',
  '/home/u/.shared/.claude/references/block-credential-leak.md',
  '/home/u/.shared/.claude/references/block-credential-mutation.md',
  '/home/u/.shared/.claude/skills/token-effizienz/token-effizienz.md',
  '/home/u/.claude/my-token-notes.md',
  '/home/u/.claude/auth-flow.md'
]

// Neutrale Doku: BEIDE Seiten erlaubt (kein Wort-Treffer, keine Secret-Klasse).
const SAFE_PATHS = [
  '/home/u/.claude/CLAUDE.md',
  '/home/u/.claude/rules/harte-regeln.md',
  '/home/u/.claude/agents/humangenetiker.md',
  '/home/u/.claude/agents/AGENTS.md',
  '/home/u/.shared/.claude/skills/token-effizienz/SKILL.md',
  '/home/u/notes/settings-overview.md'
]

test('echte Secret-WERT-Pfade sind read UND write secret-bearing (Default-strikt)', () => {
  for (const p of SECRET_VALUE_PATHS) {
    expect(isSecretPathForRead(p), `ForRead sollte true sein: ${p}`).toBe(true)
    expect(isSecretPathForWrite(p), `ForWrite sollte true sein: ${p}`).toBe(true)
    // Default (kein ownerEdit) -> strikt geblockt (Bulk-/Ordner-/Move-Pfade).
    const v = assertWritable(p)
    expect(v.writable, `writable sollte false sein: ${p}`).toBe(false)
    expect(v.reason).toBe(SECRET_DENY_REASON)
  }
})

test('Nicht-Markdown mit Secret-Wort: READ-sichtbar, aber WRITE-verweigert (Wortheuristik)', () => {
  for (const p of READ_VISIBLE_PATHS) {
    // Read zeigt die Datei an (keine Secret-WERT-Klasse).
    expect(isSecretPathForRead(p), `ForRead sollte false sein: ${p}`).toBe(false)
    // Write bleibt streng: Wort-Basename (Nicht-.md) -> verweigert (Default, kein ownerEdit).
    expect(isSecretPathForWrite(p), `ForWrite sollte true sein: ${p}`).toBe(true)
    const v = assertWritable(p)
    expect(v.writable, `writable sollte false sein: ${p}`).toBe(false)
    expect(v.reason).toBe(SECRET_DENY_REASON)
  }
})

test('Markdown-Doku ist editierbar trotz Secret-Wort im Namen (Owner-Override)', () => {
  for (const p of DOC_EDITABLE_PATHS) {
    // Read zeigt die Doku an (keine Secret-WERT-Klasse).
    expect(isSecretPathForRead(p), `ForRead sollte false sein: ${p}`).toBe(false)
    // Write: .md/.markdown/.mdx ueberspringt die Wortheuristik -> editierbar.
    expect(isSecretPathForWrite(p), `ForWrite sollte false sein: ${p}`).toBe(false)
    const v = assertWritable(p)
    expect(v.writable, `writable sollte true sein: ${p}`).toBe(true)
    expect(v.reason).toBeNull()
  }
})

test('ownerEdit-Opt-in: Secret-Klasse owner-schreibbar nur bei Schreibmodus AN', () => {
  for (const p of SECRET_VALUE_PATHS) {
    // ownerEdit + Schreibmodus AN -> owner-schreibbar (Owner-Override).
    withWriteMode(true, () => {
      const v = assertWritable(p, { ownerEdit: true })
      expect(v.writable, `ownerEdit+AN sollte true sein: ${p}`).toBe(true)
      expect(v.reason).toBeNull()
    })
    // ownerEdit + Schreibmodus AUS -> weiter geblockt (kein Bypass des Opt-outs).
    withWriteMode(false, () => {
      const v = assertWritable(p, { ownerEdit: true })
      expect(v.writable, `ownerEdit+AUS sollte false sein: ${p}`).toBe(false)
      expect(v.reason).toBe(SECRET_DENY_REASON)
    })
    // Ohne ownerEdit bleibt es strikt geblockt, auch bei Schreibmodus AN.
    withWriteMode(true, () => {
      const v = assertWritable(p)
      expect(v.writable, `kein ownerEdit -> strikt geblockt: ${p}`).toBe(false)
      expect(v.reason).toBe(SECRET_DENY_REASON)
    })
  }
})

test('neutrale Doku ist BEIDE Seiten erlaubt (kein False-Positive)', () => {
  for (const p of SAFE_PATHS) {
    expect(isSecretPathForRead(p), `ForRead sollte false sein: ${p}`).toBe(false)
    expect(isSecretPathForWrite(p), `ForWrite sollte false sein: ${p}`).toBe(false)
    const v = assertWritable(p)
    expect(v.writable, `writable sollte true sein: ${p}`).toBe(true)
    expect(v.reason).toBeNull()
  }
})

test('ForWrite ist Obermenge von ForRead (Write nie schwaecher als Read)', () => {
  const all = [...SECRET_VALUE_PATHS, ...READ_VISIBLE_PATHS, ...DOC_EDITABLE_PATHS, ...SAFE_PATHS]
  for (const p of all) {
    if (isSecretPathForRead(p)) {
      expect(isSecretPathForWrite(p), `ForWrite muss ForRead enthalten: ${p}`).toBe(true)
    }
  }
})

// ── readFull-Anzeige-Verhalten (Owner-Override) ────────────────────────────
// Deutlich gefakter Dummy-Token (>=20 Z) in einem settings.json-Fixture.
const DUMMY_TOKEN = 'DUMMY-sk-zzzz9999yyyy8888xxxx7777'

// Mirror der detectCredentials-hasSecret-Entscheidung (ipc-write.ts, privat, nicht
// exportiert): NACKTER Inline-Credential vs reine ${VAR}-Referenz. true nur bei
// echtem nacktem Wert (Defense-in-Depth-Zweig im Nicht-Secret-Pfad).
function hasNakedCredential(content: string): boolean {
  const assignRx =
    /(?:password|passwd|token|secret|api[_-]?key|auth[_-]?key)\s*[=:]\s*(?!["']?\$\{)[^\s$#\r\n]{6,}/gi
  return assignRx.test(content)
}

// Read-Seite exakt wie buildReadFullResult komponieren: roh aus Datei lesen,
// dann je nach Secret-Klassifikation + reveal maskieren / demaskieren + auditen.
// Defense-in-Depth: auch Nicht-Secret-Pfad mit nacktem Inline-Credential -> maskiert.
function readFullBehavior(
  path: string,
  raw: string,
  reveal: boolean,
  auditPath: string
): { content: string; masked: boolean; maskedCount: number } {
  const isSecret = isSecretPathForRead(path)
  if (isSecret && reveal) {
    appendAudit(makeAuditEntry('readfull-reveal', path, 'ok'), auditPath)
    return { content: raw, masked: false, maskedCount: 0 }
  }
  if (isSecret) {
    const { masked, maskedCount } = maskSecrets(raw, path)
    return { content: masked, masked: true, maskedCount }
  }
  if (hasNakedCredential(raw)) {
    const { masked, maskedCount } = maskSecrets(raw, path)
    return { content: masked, masked: true, maskedCount }
  }
  return { content: raw, masked: false, maskedCount: 0 }
}

// 11. readFull auf Secret-Klasse-Datei -> maskiert (Negativ-Match), count>0.
test('readFull Secret-Klasse: masked=true, Dummy-Wert NICHT im content', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', JSON.stringify({ apiKey: DUMMY_TOKEN, theme: 'dark' }))
  expect(isSecretPathForRead(file), 'settings.json muss Secret-Klasse sein').toBe(true)
  const raw = readFileSync(file, 'utf8')
  const r = readFullBehavior(file, raw, false, sb.auditPath)
  expect(r.masked).toBe(true)
  expect(r.maskedCount).toBeGreaterThan(0)
  expect(r.content).not.toContain(DUMMY_TOKEN) // Negativ-Match
  expect(r.content).toContain('"theme": "dark"') // Nicht-Secret bleibt sichtbar
})

// 12. readFull reveal:true -> roher Inhalt; Audit 'readfull-reveal' mit Pfad,
//     Dummy-Wert NICHT im Log (Audit protokolliert nur Basename/Aktion).
test('readFull reveal: roher Inhalt + Audit readfull-reveal ohne Wert', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', JSON.stringify({ token: DUMMY_TOKEN }))
  const raw = readFileSync(file, 'utf8')
  const r = readFullBehavior(file, raw, true, sb.auditPath)
  expect(r.masked).toBe(false)
  expect(r.content).toContain(DUMMY_TOKEN) // reveal -> roh
  const audit = readFileSync(sb.auditPath, 'utf8')
  expect(audit).toContain('"action":"readfull-reveal"')
  expect(audit).toContain('"path":"settings.json"') // nur Basename, kein Verzeichnis
  expect(audit).not.toContain(DUMMY_TOKEN) // KEIN Secret-Wert im Log
})

// 13. Write-Seite Default-strikt: Secret-Klasse-Datei bleibt ohne ownerEdit
//     schreib-geblockt (Bulk-/Ordner-/Reconcile-/Rename-/Move-Pfade nutzen diesen
//     Default). Der owner-initiierte Einzeldatei-Edit nutzt das ownerEdit-Opt-in
//     (eigener Test oben); der Datenverlust-Schutz haengt nicht an diesem Guard.
test('Write-Seite Secret-Klasse bleibt geblockt (Default, kein ownerEdit)', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', '{}')
  const v = assertWritable(file)
  expect(v.writable).toBe(false)
  expect(v.reason).toBe(SECRET_DENY_REASON)
})

// 14. Nicht-Secret-Datei: readFull liefert roh, masked nicht gesetzt/false.
test('readFull Nicht-Secret-Datei: roh, masked=false', () => {
  const sb = makeSandbox()
  const body = '# Doku\nKein Secret hier, nur Text.\n'
  const file = seedFile(sb, 'NOTES.md', body)
  expect(isSecretPathForRead(file)).toBe(false)
  const raw = readFileSync(file, 'utf8')
  const r = readFullBehavior(file, raw, false, sb.auditPath)
  expect(r.masked).toBe(false)
  expect(r.maskedCount).toBe(0)
  expect(r.content).toBe(body) // byte-identisch roh
})

// 15. Defense-in-Depth: NICHT-secret-klassifizierte Datei (notes.md) mit NACKTEM
//     Inline-Credential -> readFull maskiert trotzdem (masked=true), Dummy NICHT
//     im content. Gegenprobe: harmlose .md ohne Credential bleibt byte-roh.
test('readFull Nicht-Secret-Pfad mit nacktem Credential: maskiert (Defense-in-Depth)', () => {
  const sb = makeSandbox()
  // notes.md ist KEINE Secret-Klasse (ForRead false), traegt aber einen nackten Token.
  const body = `# Notizen\napi_key = ${DUMMY_TOKEN}\nharmloser Text danach\n`
  const file = seedFile(sb, 'notes.md', body)
  expect(isSecretPathForRead(file), 'notes.md darf KEINE Secret-Klasse sein').toBe(false)
  const raw = readFileSync(file, 'utf8')
  const r = readFullBehavior(file, raw, false, sb.auditPath)
  expect(r.masked, 'nackter Credential im Nicht-Secret-Pfad muss maskieren').toBe(true)
  expect(r.maskedCount).toBeGreaterThan(0)
  expect(r.content).not.toContain(DUMMY_TOKEN) // Wert verlaesst die Bridge NICHT
  expect(r.content).toContain('harmloser Text danach') // Nicht-Secret-Zeile bleibt

  // Gegenprobe: harmlose Doku OHNE Credential bleibt roh/unmaskiert.
  const safeBody = '# Notizen\nNur Prosa, kein Geheimnis.\nNoch eine Zeile.\n'
  const safeFile = seedFile(sb, 'plain.md', safeBody)
  expect(isSecretPathForRead(safeFile)).toBe(false)
  const safeRaw = readFileSync(safeFile, 'utf8')
  const sr = readFullBehavior(safeFile, safeRaw, false, sb.auditPath)
  expect(sr.masked).toBe(false)
  expect(sr.maskedCount).toBe(0)
  expect(sr.content).toBe(safeBody) // byte-identisch roh
})

// ── applyWrite-Verdrahtung (P1) + P2-Begrenzung ────────────────────────────
// Beweist die ECHTE Kette bis zur Mutation (nicht nur assertWritable direkt):
// applyWrite -> checkPath(req.path, roots, ownerEditPath) -> assertWritable.
// P1: settings.json-Edit gelingt NUR mit ownerEdit:true + Schreibmodus AN.
// P2: ownerEdit wirkt NUR fuer edit/add auf req.path — NIE fuer move/archive/Dir.

// Apply-Optionen fuer die Sandbox (Scope = configDir; Archiv + Audit temp).
function applyOpts(sb: ReturnType<typeof makeSandbox>) {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
}

// 16. P1: edit auf settings.json -> mit ownerEdit:true erlaubt, ohne geblockt.
test('applyWrite P1: settings.json edit nur mit ownerEdit + Schreibmodus AN', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', JSON.stringify({ theme: 'dark' }))
  expect(isSecretPathForWrite(file)).toBe(true)
  withWriteMode(true, () => {
    // Ohne ownerEdit -> Secret-Klasse hart geblockt (Default-strikt).
    const blocked = applyWrite({ action: 'edit', path: file, content: '{"theme":"light"}' }, applyOpts(sb))
    expect(blocked.error).toBe(SECRET_DENY_REASON)
    expect(blocked.data).toBeNull()
    expect(readFileSync(file, 'utf8')).toContain('dark') // unveraendert

    // Mit ownerEdit:true -> Owner-Override greift, echte Mutation + Backup.
    const ok = applyWrite(
      { action: 'edit', path: file, content: '{"theme":"light"}', ownerEdit: true },
      applyOpts(sb)
    )
    expect(ok.error).toBeNull()
    expect(ok.data?.action).toBe('edit')
    expect(ok.data?.backupPath).not.toBeNull() // backup-first lief
    expect(readFileSync(file, 'utf8')).toContain('light') // wirklich geschrieben
  })
})

// 17. ownerEdit + Schreibmodus AUS -> auch der edit-Pfad bleibt geblockt.
//     (Gate-OFF wird in apply via assertWritable->isWriteEnabled durchgesetzt.)
test('applyWrite: ownerEdit ohne Schreibmodus bleibt geblockt', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', '{}')
  withWriteMode(false, () => {
    const res = applyWrite({ action: 'edit', path: file, content: '{}', ownerEdit: true }, applyOpts(sb))
    expect(res.error).toBe(SECRET_DENY_REASON)
    expect(res.data).toBeNull()
  })
})

// 18. P2-Negativ: move eines Secret-Pfads bleibt GEBLOCKT, auch wenn ownerEdit:true
//     mitgeschickt wird (apply gated ownerEdit auf action edit/add -> false bei move).
test('applyWrite P2: move auf Secret-Pfad bleibt geblockt trotz ownerEdit', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', '{}')
  const dest = sandboxPath(sb, 'sub', 'settings.json')
  withWriteMode(true, () => {
    const res = applyWrite({ action: 'move', path: file, to: dest, ownerEdit: true }, applyOpts(sb))
    expect(res.error).toBe(SECRET_DENY_REASON) // req.path bleibt secret-skip
    expect(res.data).toBeNull()
    expect(exists(file)).toBe(true) // Quelle unveraendert
    expect(exists(dest)).toBe(false) // nichts verschoben
  })
})

// 19. P2-Negativ: move auf einen NICHT-secret Pfad mit Secret-ZIEL (req.to) bleibt
//     geblockt — req.to wird NIE mit ownerEdit geprueft (Secret-Datei darf nicht
//     ueber ein Move-Ziel entstehen/ueberschrieben werden).
test('applyWrite P2: move-Ziel (req.to) Secret-Klasse bleibt geblockt', () => {
  const sb = makeSandbox()
  const src = seedFile(sb, 'plain.md', '# doku')
  const secretDest = sandboxPath(sb, 'auth.json') // Secret-Klasse als Ziel
  withWriteMode(true, () => {
    const res = applyWrite({ action: 'move', path: src, to: secretDest, ownerEdit: true }, applyOpts(sb))
    expect(res.error).toBe(SECRET_DENY_REASON) // req.to secret-skip, ownerEdit ignoriert
    expect(res.data).toBeNull()
    expect(exists(src)).toBe(true)
    expect(exists(secretDest)).toBe(false)
  })
})

// 20. P2-Negativ: archive eines Secret-Pfads bleibt GEBLOCKT trotz ownerEdit:true
//     (ownerEdit gilt nur fuer edit/add; archive faellt nie unter den Override).
test('applyWrite P2: archive auf Secret-Pfad bleibt geblockt trotz ownerEdit', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', '{}')
  withWriteMode(true, () => {
    const res = applyWrite({ action: 'archive', path: file, ownerEdit: true }, applyOpts(sb))
    expect(res.error).toBe(SECRET_DENY_REASON)
    expect(res.data).toBeNull()
    expect(exists(file)).toBe(true) // nicht archiviert
  })
})

// 21. P2-Negativ: Dir-Action (archive-dir) auf einen Ordner mit Secret-Datei bleibt
//     secret-skip — applyDirAction kennt kein ownerEdit; dirCheckSecretTree blockt.
test('applyDirAction P2: archive-dir mit Secret-Datei im Baum bleibt secret-skip', () => {
  const sb = makeSandbox()
  const dir = join(sb.configDir, 'bundle')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), '{}', 'utf8') // Secret-Datei im Baum
  writeFileSync(join(dir, 'readme.md'), '# x', 'utf8')
  const res = applyDirAction({ action: 'archive-dir', path: dir }, applyOpts(sb))
  expect(res.data).toBeNull()
  expect(res.error).toBeTruthy() // dirCheckSecretTree-Block
  expect(exists(dir)).toBe(true) // Ordner unangetastet
})
