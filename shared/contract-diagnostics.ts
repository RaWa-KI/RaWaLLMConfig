import type { IpcResult } from './contract'

export interface ErrorReportRequest {
  message?: unknown
  source?: unknown
  componentStack?: unknown
}

export interface ErrorDiagnosticReport {
  kind: 'renderer-error'
  app: { name: string; version: string }
  runtime: { platform: string; electron: string; chrome: string; node: string }
  timestamp: string
  error: { message: string; source: string; componentStack: string | null }
  screenshotDataUrl: string | null
}

export interface SaveErrorReportRequest {
  error?: ErrorReportRequest
}

export interface SaveErrorReportData {
  canceled: boolean
  fileName: string | null
}

export interface DiagnosticsApi {
  saveErrorReport(req: SaveErrorReportRequest): Promise<IpcResult<SaveErrorReportData>>
}

export type SaveErrorReportResult = IpcResult<SaveErrorReportData>

const LIMITS = { message: 240, source: 80, componentStack: 1200 } as const

export function sanitizeErrorReportRequest(req: unknown): Required<ErrorReportRequest> {
  const record = asRecord(req)
  return {
    message: cleanText(record.message, LIMITS.message, 'Unbekannter Fehler'),
    source: cleanText(record.source, LIMITS.source, 'renderer'),
    componentStack: cleanOptionalText(record.componentStack, LIMITS.componentStack)
  }
}

export function sanitizeDiagnosticReport(report: ErrorDiagnosticReport): ErrorDiagnosticReport {
  const cleanError = sanitizeErrorReportRequest(report.error)
  return {
    kind: 'renderer-error',
    app: {
      name: cleanText(report.app?.name, 80, 'RaWaLLMConfig'),
      version: cleanText(report.app?.version, 40, 'unbekannt')
    },
    runtime: {
      platform: cleanText(report.runtime?.platform, 40, 'unbekannt'),
      electron: cleanText(report.runtime?.electron, 40, ''),
      chrome: cleanText(report.runtime?.chrome, 40, ''),
      node: cleanText(report.runtime?.node, 40, '')
    },
    timestamp: cleanText(report.timestamp, 40, new Date().toISOString()),
    error: {
      message: String(cleanError.message),
      source: String(cleanError.source),
      componentStack: cleanError.componentStack ? String(cleanError.componentStack) : null
    },
    screenshotDataUrl: cleanScreenshot(report.screenshotDataUrl)
  }
}

function cleanOptionalText(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim() ? cleanText(value, max, '') : ''
}

function cleanText(value: unknown, max: number, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const clean = redactLocalPaths(value).replace(/\s+/g, ' ').trim()
  return (clean || fallback).slice(0, max)
}

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

function cleanScreenshot(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('data:image/png;base64,')) return null
  return value.length <= 2_000_000 ? value : null
}
