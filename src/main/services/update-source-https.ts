/**
 * update-source-https.ts - HTTPS-Transport fuer Update-Quellen.
 * SRP: latest.json und Installer ueber geprueftes HTTPS laden.
 */

import { createWriteStream } from 'node:fs'
import { basename } from 'node:path'
import { Readable, Transform } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import type { UpdateAsset, UpdateInfo, UpdateRelease } from '@shared/contract-updates'
import type {
  StageResult,
  UpdateSourceDescription,
  UpdateSourceManifestResult,
  UpdateSourcePort,
  UpdateStageRequest,
} from './update-source-port'
import {
  HTTPS_LIMITS,
  assertAllowedHttpsUrl,
  buildHttpsPolicy,
  byteCountGate,
  isRedirectStatus,
  manifestUrlFor,
  parseHttpsUrl,
  responseGate,
  resolveRedirectUrl,
  type HttpsFetchPolicy,
  type HttpResponseGateOpts,
} from './update-http-gates'
import { checkExactSize, checkMzHeader, moveToFailed, sha256Hex } from './update-gates'
import { isValidReleaseShape } from './update-source-local'

type FetchImpl = (input: string | URL, init?: RequestInit) => Promise<Response>

interface FetchResult {
  response: Response | null
  error: string | null
}

interface BytesResult {
  bytes: Buffer | null
  error: string | null
}

export function getReleaseUrl(): string | null {
  const value = process.env.RAWALLM_RELEASE_URL?.trim()
  return value && value.length > 0 ? value : null
}

function stageError(error: string): StageResult {
  return { ok: false, sha256Verified: false, error }
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(HTTPS_LIMITS.TIMEOUT_MS)
}

function toNodeReadable(body: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>)
}

async function fetchChecked(
  fetchImpl: FetchImpl,
  startUrl: URL,
  policy: HttpsFetchPolicy,
  gateOpts: HttpResponseGateOpts
): Promise<FetchResult> {
  let currentUrl = startUrl
  for (let redirects = 0; redirects <= HTTPS_LIMITS.REDIRECTS; redirects++) {
    const urlError = assertAllowedHttpsUrl(currentUrl, policy)
    if (urlError) return { response: null, error: urlError }
    let response: Response
    try {
      response = await fetchImpl(currentUrl, { redirect: 'manual', signal: timeoutSignal() })
    } catch {
      return { response: null, error: 'Download fehlgeschlagen' }
    }
    if (!isRedirectStatus(response.status)) {
      const gateError = responseGate(response, gateOpts)
      return { response: gateError ? null : response, error: gateError }
    }
    const next = resolveRedirectUrl(currentUrl, response.headers.get('location'), policy)
    if (typeof next === 'string') return { response: null, error: next }
    currentUrl = next
  }
  return { response: null, error: 'Zu viele Redirects' }
}

async function readBytesBounded(response: Response, maxBytes: number): Promise<BytesResult> {
  if (!response.body) return { bytes: null, error: 'Download fehlgeschlagen' }
  const chunks: Buffer[] = []
  let copied = 0
  try {
    for await (const chunk of toNodeReadable(response.body)) {
      const buf = Buffer.from(chunk as Uint8Array)
      copied += buf.length
      const gateError = byteCountGate(copied, maxBytes)
      if (gateError) return { bytes: null, error: gateError }
      chunks.push(buf)
    }
    return { bytes: Buffer.concat(chunks, copied), error: null }
  } catch {
    return { bytes: null, error: 'Download fehlgeschlagen' }
  }
}

function parseRelease(bytes: Buffer): UpdateSourceManifestResult {
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'))
    if (!isValidReleaseShape(parsed)) {
      return { release: null, error: 'Manifest ungueltig', sourceConfigured: true }
    }
    const release: UpdateRelease = {
      ...parsed,
      prerelease: typeof parsed.prerelease === 'boolean' ? parsed.prerelease : false,
    }
    return { release, error: null, sourceConfigured: true }
  } catch {
    return { release: null, error: 'Manifest konnte nicht gelesen werden', sourceConfigured: true }
  }
}

function findAsset(release: UpdateRelease, info: UpdateInfo): UpdateAsset | null {
  return release.assets.find((asset) =>
    basename(asset.name) === basename(info.assetName) && asset.size === info.fileSize
  ) ?? null
}

function hashMatches(actual: string, expected: string): boolean {
  return actual.toLowerCase() === expected.toLowerCase()
}

function progressTransform(
  expectedSize: number,
  onProgress?: (copied: number, total: number) => void
): Transform {
  let copied = 0
  return new Transform({
    transform(chunk, _enc, cb) {
      copied += chunk.length
      const gateError = byteCountGate(copied, HTTPS_LIMITS.INSTALLER_BYTES, expectedSize)
      if (gateError) return cb(new Error(gateError))
      onProgress?.(copied, expectedSize)
      cb(null, chunk)
    },
  })
}

async function downloadInstaller(
  response: Response,
  info: UpdateInfo,
  destPath: string,
  onProgress?: (copied: number, total: number) => void
): Promise<StageResult | null> {
  if (!response.body) return stageError('Download fehlgeschlagen')
  try {
    await pipeline(
      toNodeReadable(response.body),
      progressTransform(info.fileSize, onProgress),
      createWriteStream(destPath)
    )
    return null
  } catch (err) {
    moveToFailed(destPath)
    return stageError(err instanceof Error ? err.message : 'Download fehlgeschlagen')
  }
}

function validateInstallerFile(destPath: string, info: UpdateInfo): StageResult | null {
  if (!checkMzHeader(destPath)) {
    moveToFailed(destPath)
    return stageError('invalid-installer')
  }
  if (!checkExactSize(destPath, info.fileSize)) {
    moveToFailed(destPath)
    return stageError('Groesse stimmt nicht ueberein')
  }
  return null
}

async function verifyRequiredSha(destPath: string, sha256: string): Promise<StageResult | null> {
  try {
    const actual = await sha256Hex(destPath)
    if (!hashMatches(actual, sha256)) {
      moveToFailed(destPath)
      return stageError('Pruefsumme stimmt nicht ueberein')
    }
    return null
  } catch {
    moveToFailed(destPath)
    return stageError('Pruefsumme konnte nicht berechnet werden')
  }
}

export class HttpsUpdateSource implements UpdateSourcePort {
  readonly kind = 'https' as const

  constructor(
    private readonly releaseUrl: string | null = getReleaseUrl(),
    private readonly fetchImpl: FetchImpl = fetch
  ) {}

  describe(): UpdateSourceDescription {
    return { kind: this.kind, configured: parseHttpsUrl(this.releaseUrl) !== null }
  }

  async readManifest(): Promise<UpdateSourceManifestResult> {
    const baseUrl = parseHttpsUrl(this.releaseUrl)
    if (!baseUrl) return { release: null, error: null, sourceConfigured: false }
    const policy = buildHttpsPolicy(baseUrl)
    const fetched = await fetchChecked(this.fetchImpl, manifestUrlFor(baseUrl), policy, {
      maxBytes: HTTPS_LIMITS.MANIFEST_BYTES,
    })
    if (fetched.error || !fetched.response) {
      return { release: null, error: fetched.error, sourceConfigured: true }
    }
    const body = await readBytesBounded(fetched.response, HTTPS_LIMITS.MANIFEST_BYTES)
    return body.error || !body.bytes
      ? { release: null, error: body.error, sourceConfigured: true }
      : parseRelease(body.bytes)
  }

  async stageInstaller(opts: UpdateStageRequest): Promise<StageResult> {
    if (!opts.info.sha256) return stageError('Pruefsumme fehlt')
    const manifest = await this.readManifest()
    if (manifest.error || !manifest.release) return stageError(manifest.error ?? 'Manifest nicht lesbar')
    const asset = findAsset(manifest.release, opts.info)
    if (!asset?.sha256 || !asset.browser_download_url) return stageError('Pruefsumme fehlt')
    if (!hashMatches(asset.sha256, opts.info.sha256)) {
      return stageError('Pruefsumme stimmt nicht ueberein')
    }
    const baseUrl = parseHttpsUrl(this.releaseUrl)
    const assetUrl = parseHttpsUrl(asset.browser_download_url)
    if (!baseUrl || !assetUrl) return stageError('HTTPS erforderlich')
    const fetched = await fetchChecked(this.fetchImpl, assetUrl, buildHttpsPolicy(baseUrl), {
      maxBytes: HTTPS_LIMITS.INSTALLER_BYTES,
      expectedSize: opts.info.fileSize,
    })
    if (fetched.error || !fetched.response) return stageError(fetched.error ?? 'Download fehlgeschlagen')
    const downloadErr = await downloadInstaller(fetched.response, opts.info, opts.destPath, opts.onProgress)
    if (downloadErr) return downloadErr
    const fileErr = validateInstallerFile(opts.destPath, opts.info)
    if (fileErr) return fileErr
    const shaErr = await verifyRequiredSha(opts.destPath, opts.info.sha256)
    if (shaErr) return shaErr
    return { ok: true, sha256Verified: true, error: null }
  }
}

export function createHttpsUpdateSource(releaseUrl?: string | null): HttpsUpdateSource {
  return new HttpsUpdateSource(releaseUrl ?? getReleaseUrl())
}
