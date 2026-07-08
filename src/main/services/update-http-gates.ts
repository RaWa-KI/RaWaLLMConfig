/**
 * update-http-gates.ts - HTTPS-Transport-Gates fuer Update-Downloads.
 * SRP: URL-/Redirect-/Response-/Groessen-Gates, keine Datei-Validierung.
 */

export const HTTPS_LIMITS = {
  MANIFEST_BYTES: 1024 * 1024,
  INSTALLER_BYTES: 200 * 1024 * 1024,
  REDIRECTS: 3,
  TIMEOUT_MS: 15_000,
} as const

const GITHUB_ASSET_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])

export interface HttpsFetchPolicy {
  origin: string
  allowGithubAssets: boolean
}

export interface HttpResponseGateOpts {
  maxBytes: number
  expectedSize?: number
}

export function parseHttpsUrl(raw: string | null | undefined): URL | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export function manifestUrlFor(baseUrl: URL): URL {
  if (baseUrl.pathname.toLowerCase().endsWith('/latest.json')) return baseUrl
  const next = new URL(baseUrl.href)
  next.pathname = `${next.pathname.replace(/\/+$/, '')}/latest.json`
  next.search = ''
  next.hash = ''
  return next
}

export function buildHttpsPolicy(baseUrl: URL): HttpsFetchPolicy {
  const host = baseUrl.hostname.toLowerCase()
  return {
    origin: baseUrl.origin,
    allowGithubAssets: GITHUB_ASSET_HOSTS.has(host),
  }
}

export function assertAllowedHttpsUrl(url: URL, policy: HttpsFetchPolicy): string | null {
  if (url.protocol !== 'https:') return 'HTTPS erforderlich'
  if (url.origin === policy.origin) return null
  const host = url.hostname.toLowerCase()
  if (policy.allowGithubAssets && GITHUB_ASSET_HOSTS.has(host)) return null
  return 'Host nicht erlaubt'
}

export function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400
}

export function resolveRedirectUrl(
  currentUrl: URL,
  location: string | null,
  policy: HttpsFetchPolicy
): URL | string {
  if (!location) return 'Redirect ohne Ziel'
  try {
    const nextUrl = new URL(location, currentUrl)
    return assertAllowedHttpsUrl(nextUrl, policy) ?? nextUrl
  } catch {
    return 'Redirect ungueltig'
  }
}

export function responseGate(response: Response, opts: HttpResponseGateOpts): string | null {
  if (response.status !== 200) return 'HTTP-Status ungueltig'
  if (isHtmlResponse(response.headers)) return 'HTML-Antwort abgelehnt'
  const length = contentLength(response.headers)
  if (length !== null && length > opts.maxBytes) return 'Download zu gross'
  if (length !== null && opts.expectedSize !== undefined && length > opts.expectedSize) {
    return 'Download zu gross'
  }
  return null
}

export function byteCountGate(
  copied: number,
  maxBytes: number,
  expectedSize?: number
): string | null {
  if (copied > maxBytes) return 'Download zu gross'
  if (expectedSize !== undefined && copied > expectedSize) return 'Download zu gross'
  return null
}

function contentLength(headers: Headers): number | null {
  const raw = headers.get('content-length')
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function isHtmlResponse(headers: Headers): boolean {
  const contentType = headers.get('content-type')?.toLowerCase() ?? ''
  return contentType.split(';', 1)[0].trim() === 'text/html'
}
