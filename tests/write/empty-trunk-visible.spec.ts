// empty-trunk-visible.spec.ts — WP-11 (B11): leere Soll-Trunk-Ordner werden
// als sichtbare leere Kategorien ausgeliefert statt unsichtbar (null) — aber
// nur, wenn der Parent (.shared/.claude) existiert; beim Fremd-Setup bleiben
// Rawa-spezifische Trunks unsichtbar (B13-Bezug). Plus: Karten-Buendelung
// (50 Findings einer Audit-Kategorie -> 1 Karte mit Zaehler).
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { LlmConfig } from '../../shared/contract'

const TRUNK_IDS = ['shared-agents', 'shared-rules', 'shared-skills', 'shared-hooks', 'shared-plugins', 'shared-tools']

function w(file: string, content: string): string {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
  return file
}

function bustScanCache(): void {
  for (const key of Object.keys(require.cache)) {
    const k = key.replace(/\\/g, '/')
    if (k.includes('/src/main/scan/') || k.includes('/src/main/services/')) delete require.cache[key]
  }
}

// shared-scan.ts liest configRoots() beim MODUL-LOAD — Env setzen, Cache
// busten, dann erst requiren.
function withSandboxEnv<T>(sb: string, fn: () => T): T {
  const saved = process.env.RAWALLM_SANDBOX_ROOT
  process.env.RAWALLM_SANDBOX_ROOT = sb
  try {
    bustScanCache()
    return fn()
  } finally {
    if (saved === undefined) delete process.env.RAWALLM_SANDBOX_ROOT
    else process.env.RAWALLM_SANDBOX_ROOT = saved
    bustScanCache()
  }
}

function scanSharedIn(sb: string): LlmConfig {
  return withSandboxEnv(sb, () => {
    const { scanShared } = require('../../src/main/scan/shared-scan') as { scanShared: () => LlmConfig }
    return scanShared()
  })
}

test('B11: leere Soll-Trunks (Parent existiert) werden als sichtbare leere Kategorien ausgeliefert', () => {
  const sb = mkdtempSync(join(tmpdir(), 'rawallm-trunk-'))
  try {
    mkdirSync(join(sb, '.shared', '.claude', 'agents'), { recursive: true }) // existiert, aber leer
    const config = scanSharedIn(sb)
    // shared-agents: Ordner existiert und ist leer; shared-rules/shared-skills:
    // Ordner fehlt, aber der Parent (.shared/.claude) existiert.
    for (const id of ['shared-agents', 'shared-rules', 'shared-skills']) {
      const cat = config.categories.find((c) => c.id === id)
      expect(cat, id).toBeDefined()
      expect(cat!.entries, id).toHaveLength(0)
      expect(cat!.blurb.toLowerCase(), id).toContain('leer')
    }
  } finally {
    rmSync(sb, { recursive: true, force: true })
  }
})

test('B11: Fremd-Setup (Parent .shared/.claude fehlt) blendet Soll-Trunks weiterhin aus', () => {
  const sb = mkdtempSync(join(tmpdir(), 'rawallm-trunk-fremd-'))
  try {
    const config = scanSharedIn(sb)
    const ids = config.categories.map((c) => c.id)
    for (const id of TRUNK_IDS) expect(ids, id).not.toContain(id)
  } finally {
    rmSync(sb, { recursive: true, force: true })
  }
})

test('Buendelung: 50 Findings einer Audit-Kategorie liefern 1 Karte mit Zaehler', () => {
  const sb = mkdtempSync(join(tmpdir(), 'rawallm-bundle-'))
  try {
    const links = Array.from({ length: 50 }, (_, i) => `[[kaputt-${i}]]`).join(' ')
    w(join(sb, 'project', 'docs', 'viele.md'), `${links}\n`)
    const audit = withSandboxEnv(sb, () => {
      const mod = require('../../src/main/scan/scan-audit-categories') as { buildAuditConfig: () => LlmConfig }
      return mod.buildAuditConfig()
    })
    const refs = audit.categories.find((cat) => cat.id === 'audit-references')
    expect(refs).toBeDefined()
    expect(refs!.entries).toHaveLength(1)
    expect(refs!.entries[0].fields?.Fundstellen).toBe('50')
    expect(refs!.blurb).toContain('50')
  } finally {
    rmSync(sb, { recursive: true, force: true })
  }
})
