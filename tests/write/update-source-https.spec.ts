// update-source-https.spec.ts - HTTPS-Transport-Specs fuer OSS Teil F F2/F3.
// Kein echter Netzwerkzugriff: fetch wird vollstaendig gemockt.
import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox, type Sandbox } from './fixtures'
import { HttpsUpdateSource } from '../../src/main/services/update-source-https'
import type { UpdateAsset, UpdateInfo, UpdateRelease } from '../../shared/contract-updates'

const BASE_URL = 'https://updates.example/releases'
const GITHUB_LATEST_URL = 'https://github.com/MonaFP/RaWaLLMConfig/releases/latest/download/latest.json'
const GOOD_CONTENT = 'MZ' + 'x'.repeat(4096)
const BAD_CONTENT = 'MZ' + 'y'.repeat(4096)

function sha(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function makeAsset(over: Partial<UpdateAsset> = {}): UpdateAsset {
  return {
    name: 'RaWa-Setup.exe',
    browser_download_url: 'https://updates.example/releases/RaWa-Setup.exe',
    size: Buffer.byteLength(GOOD_CONTENT),
    content_type: 'application/x-msdownload',
    sha256: sha(GOOD_CONTENT),
    ...over,
  }
}

function makeRelease(asset: UpdateAsset = makeAsset()): UpdateRelease {
  return {
    tag_name: 'v2.0.0',
    name: 'Release 2.0.0',
    body: 'Notes',
    published_at: '2026-06-10T00:00:00Z',
    prerelease: false,
    assets: [asset],
  }
}

function makeInfo(over: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    version: '2.0.0',
    name: 'Release 2.0.0',
    releaseNotes: '',
    publishedAt: '2026-06-10T00:00:00Z',
    assetName: 'RaWa-Setup.exe',
    fileSize: Buffer.byteLength(GOOD_CONTENT),
    isPrerelease: false,
    sha256: sha(GOOD_CONTENT),
    ...over,
  }
}

function responseWithBody(body: string, headers: Record<string, string>): Response {
  return new Response(body, { status: 200, headers })
}

function jsonResponse(release: UpdateRelease): Response {
  const body = JSON.stringify(release)
  return responseWithBody(body, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)),
  })
}

function exeResponse(body = GOOD_CONTENT, headers: Record<string, string> = {}): Response {
  return responseWithBody(body, {
    'content-type': 'application/x-msdownload',
    'content-length': String(Buffer.byteLength(body)),
    ...headers,
  })
}

function redirectResponse(location: string): Response {
  return new Response('', { status: 302, headers: { location } })
}

function queueFetch(responses: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input instanceof URL ? input.href : input, init })
    const next = responses.shift()
    if (!next) throw new Error('fetch queue exhausted')
    return next
  }
  return { calls, fetchImpl }
}

function stagedDest(sb: Sandbox): string {
  const dir = join(sb.root, 'staged')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'app-setup.exe')
}

test.describe('HttpsUpdateSource readManifest', () => {
  test('liest latest.json via HTTPS mit manual redirect', async () => {
    const mock = queueFetch([jsonResponse(makeRelease())])
    const source = new HttpsUpdateSource(BASE_URL, mock.fetchImpl)
    const result = await source.readManifest()
    expect(result.error).toBe(null)
    expect(result.sourceConfigured).toBe(true)
    expect(result.release?.tag_name).toBe('v2.0.0')
    expect(mock.calls[0].url).toBe(`${BASE_URL}/latest.json`)
    expect(mock.calls[0].init?.redirect).toBe('manual')
  })

  test('liest GitHub latest/download latest.json ueber Release-Asset-Redirect', async () => {
    const cdnUrl = 'https://release-assets.githubusercontent.com/github-production-release-asset/latest.json'
    const mock = queueFetch([redirectResponse(cdnUrl), jsonResponse(makeRelease())])
    const result = await new HttpsUpdateSource(GITHUB_LATEST_URL, mock.fetchImpl).readManifest()
    expect(result.error).toBe(null)
    expect(result.release?.tag_name).toBe('v2.0.0')
    expect(mock.calls.map((call) => call.url)).toEqual([GITHUB_LATEST_URL, cdnUrl])
    expect(mock.calls.every((call) => call.init?.redirect === 'manual')).toBe(true)
  })

  test('http-Release-URL wird nicht als konfigurierte HTTPS-Quelle akzeptiert', async () => {
    const mock = queueFetch([])
    const source = new HttpsUpdateSource('http://updates.example/releases', mock.fetchImpl)
    const result = await source.readManifest()
    expect(result).toEqual({ release: null, error: null, sourceConfigured: false })
    expect(mock.calls).toHaveLength(0)
  })

  test('302 auf fremden Host wird abgelehnt', async () => {
    const mock = queueFetch([redirectResponse('https://evil.example/latest.json')])
    const source = new HttpsUpdateSource(BASE_URL, mock.fetchImpl)
    const result = await source.readManifest()
    expect(result.release).toBe(null)
    expect(result.error).toBe('Host nicht erlaubt')
  })
})

test.describe('HttpsUpdateSource stageInstaller', () => {
  test('Happy-Path streamt Installer, prueft SHA und meldet Progress', async () => {
    const sb = makeSandbox()
    const mock = queueFetch([jsonResponse(makeRelease()), exeResponse()])
    const progress: Array<{ copied: number; total: number }> = []
    const destPath = stagedDest(sb)
    const result = await new HttpsUpdateSource(BASE_URL, mock.fetchImpl).stageInstaller({
      info: makeInfo(),
      destPath,
      onProgress: (copied, total) => progress.push({ copied, total }),
    })
    expect(result).toEqual({ ok: true, sha256Verified: true, error: null })
    expect(existsSync(destPath)).toBe(true)
    expect(statSync(destPath).size).toBe(Buffer.byteLength(GOOD_CONTENT))
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1].copied).toBe(Buffer.byteLength(GOOD_CONTENT))
    expect(progress.every((p) => p.total === Buffer.byteLength(GOOD_CONTENT))).toBe(true)
  })

  test('fehlende HTTPS-SHA wird hart abgelehnt', async () => {
    const sb = makeSandbox()
    const mock = queueFetch([])
    const result = await new HttpsUpdateSource(BASE_URL, mock.fetchImpl).stageInstaller({
      info: makeInfo({ sha256: undefined }),
      destPath: stagedDest(sb),
    })
    expect(result).toEqual({ ok: false, sha256Verified: false, error: 'Pruefsumme fehlt' })
    expect(mock.calls).toHaveLength(0)
  })

  test('Asset-URL mit http-Scheme wird abgelehnt', async () => {
    const sb = makeSandbox()
    const asset = makeAsset({ browser_download_url: 'http://updates.example/RaWa-Setup.exe' })
    const mock = queueFetch([jsonResponse(makeRelease(asset))])
    const result = await new HttpsUpdateSource(BASE_URL, mock.fetchImpl).stageInstaller({
      info: makeInfo(),
      destPath: stagedDest(sb),
    })
    expect(result.error).toBe('HTTPS erforderlich')
    expect(mock.calls).toHaveLength(1)
  })

  test('Asset text/html wird vor Datei-Gates abgelehnt', async () => {
    const sb = makeSandbox()
    const html = '<html>not an installer</html>'
    const mock = queueFetch([jsonResponse(makeRelease()), exeResponse(html, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': String(Buffer.byteLength(html)),
    })])
    const result = await new HttpsUpdateSource(BASE_URL, mock.fetchImpl).stageInstaller({
      info: makeInfo(),
      destPath: stagedDest(sb),
    })
    expect(result.error).toBe('HTML-Antwort abgelehnt')
  })

  test('content-length groesser als erwartete Size wird abgelehnt', async () => {
    const sb = makeSandbox()
    const destPath = stagedDest(sb)
    const mock = queueFetch([jsonResponse(makeRelease()), exeResponse(GOOD_CONTENT, {
      'content-length': String(Buffer.byteLength(GOOD_CONTENT) + 1),
    })])
    const result = await new HttpsUpdateSource(BASE_URL, mock.fetchImpl).stageInstaller({
      info: makeInfo(),
      destPath,
    })
    expect(result.error).toBe('Download zu gross')
    expect(existsSync(destPath)).toBe(false)
  })

  test('Hash-Mismatch verschiebt Teil-Copy nach _failed', async () => {
    const sb = makeSandbox()
    const destPath = stagedDest(sb)
    const mock = queueFetch([jsonResponse(makeRelease()), exeResponse(BAD_CONTENT)])
    const result = await new HttpsUpdateSource(BASE_URL, mock.fetchImpl).stageInstaller({
      info: makeInfo(),
      destPath,
    })
    expect(result.error).toBe('Pruefsumme stimmt nicht ueberein')
    expect(result.sha256Verified).toBe(false)
    expect(existsSync(destPath)).toBe(false)
    expect(readdirSync(join(sb.root, 'staged', '_failed')).length).toBe(1)
  })
})
