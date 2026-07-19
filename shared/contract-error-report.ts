import type { IpcResult } from './contract'

// Online-Fehlerbericht an den Entwickler (D055, Stufe-2-Errorhandling).
// Getrennt vom lokalen Diagnose-Export (contract-diagnostics speichert eine
// JSON-Datei per Save-Dialog): dieser Pfad sendet nach aktivem Nutzer-Consent
// an den zentralen API-Endpunkt. Keine PII, keine Pfade, keine Secrets —
// alle Freitext-Felder laufen durch die Pfad-Redaktion.

export const IPC_ERROR_REPORT = {
  collect: 'error-report:collect',
  submit: 'error-report:submit'
} as const

export interface ErrorReportSystemInfo {
  appVersion: string
  schemaVersion: number
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  platform: string
  arch: string
  osRelease: string
  freeMemoryMB: number
  totalMemoryMB: number
}

export interface ErrorReportCollectInput {
  message?: unknown
  stack?: unknown
  source?: unknown
}

export interface ErrorReportCollectResult {
  screenshot: string | null // Base64-PNG (max 800px Breite), null wenn nicht moeglich
  systemInfo: ErrorReportSystemInfo
  rateLimit: { remaining: number; limit: number }
}

export interface ErrorReportSubmitInput {
  errorMessage?: unknown
  errorStack?: unknown
  errorSource?: unknown
  userComment?: unknown
  includeScreenshot?: unknown
  includeLogs?: unknown
  logs?: unknown
}

export interface ErrorReportSubmitResult {
  success: boolean
  reportId?: string
  error?: string
}

export interface ErrorReportApi {
  collect(req: ErrorReportCollectInput): Promise<IpcResult<ErrorReportCollectResult>>
  submit(req: ErrorReportSubmitInput): Promise<IpcResult<ErrorReportSubmitResult>>
}

export interface CleanSubmitInput {
  errorMessage: string
  errorStack: string
  errorSource: string
  userComment: string
  includeScreenshot: boolean
  includeLogs: boolean
  logs: string
}

const LIMITS = { message: 500, stack: 4000, source: 80, comment: 2000, logs: 200_000 } as const

export function sanitizeSubmitInput(req: unknown): CleanSubmitInput {
  const record = asRecord(req)
  return {
    errorMessage: cleanText(record.errorMessage, LIMITS.message, 'Unbekannter Fehler'),
    errorStack: cleanMultiline(record.errorStack, LIMITS.stack),
    errorSource: cleanText(record.errorSource, LIMITS.source, 'manual'),
    userComment: cleanMultiline(record.userComment, LIMITS.comment),
    includeScreenshot: record.includeScreenshot === true,
    includeLogs: record.includeLogs === true,
    logs: cleanLogs(record.logs)
  }
}

function cleanText(value: unknown, max: number, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const clean = redactLocalPaths(value).replace(/\s+/g, ' ').trim()
  return (clean || fallback).slice(0, max)
}

// Stack/Logs bleiben mehrzeilig lesbar, werden aber ebenfalls pfad-redaktiert.
function cleanMultiline(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return redactLocalPaths(value).trim().slice(0, max)
}

function cleanLogs(value: unknown): string {
  if (typeof value !== 'string') return ''
  return redactLocalPaths(value).slice(0, LIMITS.logs)
}

// Gleiche Redaktions-Regeln wie contract-diagnostics (bewusst eigenstaendig
// gehalten, damit beide Vertraege ohne Quer-Abhaengigkeit bleiben).
function redactLocalPaths(value: string): string {
  return value
    .replace(/\\\\[^\s)]+\\[^\s)]+/g, '[lokaler-pfad]')
    .replace(/[A-Za-z]:\\[^\r\n]+/g, '[lokaler-pfad]')
    .replace(/file:\/\/\/[^\r\n]+/g, '[lokaler-pfad]')
    .replace(/\/(?:Users|home)\/[^\r\n]+/g, '[lokaler-pfad]')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}
