import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { DoctorHookRegistration, DoctorSettingsLayer } from '../../src/main/scan/claude-doctor-context'
import { auditClaudeHookRuntime } from '../../src/main/scan/claude-hook-runtime-audit'
import { auditClaudeHookStatic } from '../../src/main/scan/claude-hook-static-audit'
import { makeSandbox, sandboxPath } from './fixtures'

const DAY_MS = 86_400_000

function writeText(filePath: string, text: string): string {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, text, 'utf8')
  return filePath
}

function writeJsonl(filePath: string, rows: unknown[]): string {
  return writeText(filePath, `${rows.map((row) => typeof row === 'string' ? row : JSON.stringify(row)).join('\n')}\n`)
}

function attachment(type: string, extra: Record<string, unknown>): unknown {
  return { type: 'attachment', attachment: { type, ...extra } }
}

function layer(hooks: DoctorHookRegistration[]): DoctorSettingsLayer {
  return { layer: 'user', precedence: 3, observability: 'read', enabledPlugins: {},
    extraKnownMarketplaces: [], skillOverrides: {}, hooks }
}

test('D7 quantiles separate timeouts from cancellations and D10 errors stay sanitized', () => {
  const sb = makeSandbox(); const sentinel = 'SENTINEL_RAW_PROMPT_AND_STACK'
  const base = { hookName: 'briefing-drift.cjs', hookEvent: 'PreToolUse:Bash' }
  const transcript = writeJsonl(sandboxPath(sb, 'transcripts', 'recent.jsonl'), [
    attachment('hook_succeeded', { ...base, durationMs: 100, prompt: sentinel }),
    attachment('hook_succeeded', { ...base, durationMs: 200 }),
    attachment('hook_cancelled', { ...base, durationMs: 300, timedOut: true, timeoutMs: 250 }),
    attachment('hook_cancelled', { ...base, durationMs: 400, timedOut: true }),
    attachment('hook_cancelled', { ...base, durationMs: 500, timedOut: false, timeoutMs: 450 }),
    attachment('hook_error_during_execution', {
      ...base, errorClass: 'ReferenceError', undefinedIdentifier: 'MAX_BLOCK_LINES',
      message: sentinel, stack: sentinel,
    }),
    attachment('hook_non_blocking_error', {
      ...base, errorClass: 'ReferenceError', undefinedIdentifier: 'MAX_BLOCK_LINES', body: sentinel,
    }),
    { type: 'user', message: sentinel },
  ])

  const result = auditClaudeHookRuntime({ transcriptRoots: [transcript],
    limits: { maxAgeDays: 10, maxFiles: 100, maxFileBytes: 8 * 1024 ** 2, maxTotalBytes: 64 * 1024 ** 2 } })

  expect(result.runtimes).toEqual([{
    rule: 'D7', kind: 'observed-hook-runtime', hookName: 'briefing-drift.cjs',
    hookEvent: 'PreToolUse:Bash', observedAttachments: 7, durationSamples: 5,
    p50Ms: 300, p90Ms: 500, timeouts: 1, cancellations: 2,
  }])
  expect(result.errors).toEqual([expect.objectContaining({
    rule: 'D10', errorClass: 'ReferenceError', undefinedIdentifier: 'MAX_BLOCK_LINES', count: 2,
  })])
  expect(result.errors[0].fingerprint).toMatch(/^[a-f0-9]{16}$/)
  expect(result.coverage.complete).toBe(true)
  expect(JSON.stringify(result)).not.toContain(sentinel)
})

test('runtime coverage exposes age, file, size and invalid-line truncation', () => {
  const sb = makeSandbox(); const now = Date.UTC(2026, 7, 8, 12)
  const root = sandboxPath(sb, 'transcripts')
  const recent = writeJsonl(path.join(root, 'recent.jsonl'), ['{invalid-json'])
  const oversize = writeText(path.join(root, 'oversize.jsonl'), 'x'.repeat(300))
  const capped = writeJsonl(path.join(root, 'capped.jsonl'), [attachment('hook_succeeded', {
    hookName: 'safe.cjs', hookEvent: 'Stop', durationMs: 1,
  })])
  const old = writeJsonl(path.join(root, 'old.jsonl'), [])
  utimesSync(recent, new Date(now), new Date(now)); utimesSync(oversize, new Date(now - 1), new Date(now - 1))
  utimesSync(capped, new Date(now - 2), new Date(now - 2)); utimesSync(old, new Date(now - 11 * DAY_MS), new Date(now - 11 * DAY_MS))

  const result = auditClaudeHookRuntime({ transcriptRoots: [root], nowMs: now,
    limits: { maxAgeDays: 10, maxFiles: 2, maxFileBytes: 200, maxTotalBytes: 1_000 } })

  expect(result.coverage).toMatchObject({ complete: false, eligibleFiles: 3, scannedFiles: 1,
    skippedOldFiles: 1, skippedOversizeFiles: 1, skippedByFileCap: 1, invalidJsonLines: 1 })
  expect(result.coverage.reasons).toEqual(expect.arrayContaining(['file-cap', 'file-byte-cap', 'invalid-jsonl']))
})

test('runtime total-byte cap is explicit and never yields a healthy claim', () => {
  const sb = makeSandbox(); const now = Date.UTC(2026, 7, 8, 12)
  const root = sandboxPath(sb, 'transcripts')
  const first = writeJsonl(path.join(root, 'first.jsonl'), [attachment('hook_succeeded', {
    hookName: 'first.cjs', hookEvent: 'Stop', durationMs: 1,
  })])
  const second = writeJsonl(path.join(root, 'second.jsonl'), [attachment('hook_succeeded', {
    hookName: 'second.cjs', hookEvent: 'Stop', durationMs: 2,
  })])
  utimesSync(first, new Date(now), new Date(now)); utimesSync(second, new Date(now - 1), new Date(now - 1))
  const firstBytes = Buffer.byteLength(JSON.stringify(attachment('hook_succeeded', {
    hookName: 'first.cjs', hookEvent: 'Stop', durationMs: 1,
  }))) + 1

  const result = auditClaudeHookRuntime({ transcriptRoots: [root], nowMs: now,
    limits: { maxAgeDays: 10, maxFiles: 100, maxFileBytes: 8 * 1024 ** 2, maxTotalBytes: firstBytes } })

  expect(result.coverage).toMatchObject({ complete: false, scannedFiles: 1, skippedByTotalByteCap: 1 })
  expect(result.coverage.reasons).toContain('total-byte-cap')
})

test('runtime discovery cap is explicit', () => {
  const sb = makeSandbox(); const root = sandboxPath(sb, 'transcripts')
  for (let index = 0; index < 1_001; index += 1) writeJsonl(path.join(root, `${index}.jsonl`), [])

  const result = auditClaudeHookRuntime({ transcriptRoots: [root],
    limits: { maxAgeDays: 10, maxFiles: 1, maxFileBytes: 100, maxTotalBytes: 100 } })

  expect(result.coverage).toMatchObject({ complete: false, discoveryTruncated: true })
  expect(result.coverage.reasons).toContain('discovery-cap')
})

test('D8 applies strict 2/10/60 second thresholds and safe heavy classes once per hook', () => {
  const hooks: DoctorHookRegistration[] = [
    { event: 'PreToolUse', type: 'command', timeoutSeconds: 2, async: false, scriptPath: 'safe.cjs' },
    { event: 'PostToolUse', type: 'command', timeoutSeconds: 2.01, async: false, scriptPath: 'post.cjs' },
    { event: 'SessionStart', type: 'command', timeoutSeconds: 10, async: false, scriptPath: 'start.cjs' },
    { event: 'Stop', type: 'command', timeoutSeconds: 61, async: false, scriptPath: 'stop.cjs', heavyClass: 'package-manager' },
    { event: 'Notification', type: 'command', timeoutSeconds: 61, async: true, scriptPath: 'notify.cjs' },
    { event: 'UserPromptSubmit', type: 'command', async: false, scriptPath: 'network.cjs', heavyClass: 'network-client' },
    { event: 'PreToolUse', type: 'command', async: false, scriptPath: 'cold.cjs', heavyClass: 'cold-interpreter' },
  ]
  const result = auditClaudeHookStatic({ settingsLayers: [layer(hooks)], sourcePaths: [], readText: () => '' })

  expect(result.configuration).toHaveLength(5)
  expect(result.configuration.find((item) => item.hookName === 'post.cjs')?.labels).toEqual(['event-threshold-2s'])
  expect(result.configuration.find((item) => item.hookName === 'stop.cjs')?.labels)
    .toEqual(['event-threshold-10s', 'hard-cap-60s', 'heavy-package-manager'])
  expect(result.configuration.find((item) => item.hookName === 'notify.cjs')?.labels).toEqual(['hard-cap-60s'])
  expect(result.configuration.map((item) => item.labels).flat()).toEqual(expect.arrayContaining([
    'heavy-network-client', 'heavy-package-manager', 'heavy-cold-interpreter',
  ]))
})

test('D10 masks literals/comments and reports only a free ALL-CAPS identifier', () => {
  const sb = makeSandbox(); const sentinel = 'SENTINEL_RAW_COMMAND_PROMPT'
  const sourcePath = writeText(sandboxPath(sb, 'hooks', 'undefined.cjs'), [
    "import { IMPORTED_CONST } from './constants.cjs'",
    'const MAX_LOCAL = 30',
    'function inspect(PARAM_LIMIT) {',
    "  const { REQUIRED_CONST } = require('./values.cjs')",
    '  const config = { OBJECT_KEY: REQUIRED_CONST }',
    '  config.MEMBER_PROP = MAX_LOCAL',
    '  LOOP_LABEL: for (const item of []) break LOOP_LABEL',
    `  // COMMENT_ONLY ${sentinel}`,
    `  const text = 'STRING_ONLY ${sentinel}'`,
    '  const template = `TEMPLATE_RAW ${MAX_BLOCK_LINES}`',
    '  return IMPORTED_CONST + PARAM_LIMIT + JSON.stringify(config)',
    '}',
  ].join('\n'))

  const result = auditClaudeHookStatic({ settingsLayers: [], sourcePaths: [sourcePath] })

  expect(result.undefinedIdentifiers).toEqual([{
    rule: 'D10', kind: 'undefined-all-caps', filePath: sourcePath, name: 'MAX_BLOCK_LINES', line: 10,
  }])
  expect(JSON.stringify(result)).not.toContain(sentinel)
  expect(JSON.stringify(result)).not.toContain('STRING_ONLY')
})

test('D11 reports only same-function straight-line state before delivery', () => {
  const sb = makeSandbox()
  const sourcePath = writeText(sandboxPath(sb, 'hooks', 'ordering.js'), [
    'function positive() { saveState(); emit() }',
    'function reversed() { write(); markSeen() }',
    'function branch(ready) { saveState(); if (ready) { inject() } }',
    'function transferred() { markSeen(); return; write() }',
    'function nested() { saveState(); function later() { write() } }',
    'function callback(items) { markSeen(); items.forEach(() => { emit() }) }',
    'function nearMiss() { saveStateLater(); emitLater() }',
    'const custom = () => { persist(); send() }',
  ].join('\n'))

  const normal = auditClaudeHookStatic({ settingsLayers: [], sourcePaths: [sourcePath] })
  const custom = auditClaudeHookStatic({ settingsLayers: [], sourcePaths: [sourcePath],
    stateCallTails: ['persist'], deliveryCallTails: ['send'] })

  expect(normal.deliveryOrder).toEqual([expect.objectContaining({ functionName: 'positive',
    stateCall: 'saveState', stateLine: 1, deliveryCall: 'emit', deliveryLine: 1 })])
  expect(custom.deliveryOrder).toEqual([expect.objectContaining({ functionName: 'custom',
    stateCall: 'persist', deliveryCall: 'send' })])
})
