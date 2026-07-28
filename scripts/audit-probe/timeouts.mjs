import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const AUDIT_OUT_DIR = resolve('tests/audit-runtime')
export const UI_SMOKE_TIMEOUT_MS = 120_000
// F-WP1: drei Szenarien (normal + firstRun mit Onboarding-Scan + Sandbox-Scan)
// mit eigenen Launches brauchen deutlich mehr als die frueheren 50 s.
export const PERF_SMOKE_TIMEOUT_MS = 240_000
export const LAUNCH_TIMEOUT_MS = 25_000
// 2026-07-28: 10 s erwiesen sich auf trägen Windows-Shared-Runnern als zu knapp
// (2× identischer Timeout: erster Section-Button erst nach >10 s sichtbar,
// Run 30336669003 — diff-los, lokal <1 s). 30 s bleibt weit unter den
// Gesamtbudgets (120 s/240 s) und filtert weiter echte Haenger heraus.
export const STEP_TIMEOUT_MS = 30_000

export function withDeadline(work, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

export function writeJson(path, payload) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
}

export function failPayload(label, error, extra = {}) {
  return {
    status: 'FAIL',
    label,
    generatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    ...extra
  }
}
