import type { ErrorReportRequest } from '@shared/contract-diagnostics'

export interface ErrorBoundaryState {
  hasError: boolean
  msg: string
  source: string
  componentStack: string | null
  reportStatus: string | null
  reportBusy: boolean
}

export function deriveErrorBoundaryState(err: unknown): ErrorBoundaryState {
  const msg = err instanceof Error ? clean(err.message, 200) : 'Unbekannter Fehler'
  return { hasError: true, msg, source: 'React ErrorBoundary', componentStack: null, reportStatus: null, reportBusy: false }
}

export function sanitizeComponentStack(stack: unknown): string | null {
  if (typeof stack !== 'string' || !stack.trim()) return null
  return clean(stack.replace(/\s+/g, ' '), 800)
}

export function buildErrorReportRequest(state: ErrorBoundaryState): ErrorReportRequest {
  return {
    message: state.msg,
    source: state.source,
    componentStack: state.componentStack ?? undefined
  }
}

function clean(value: string, max: number): string {
  return value
    .replace(/[A-Za-z]:\\[^\s)]+/g, '[lokaler-pfad]')
    .replace(/file:\/\/\/[^\s)]+/g, '[lokaler-pfad]')
    .slice(0, max)
}
