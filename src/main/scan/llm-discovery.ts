// llm-discovery.ts — read-only Modellfunde fuer das Onboarding.
// GGUF-Funde stammen aus Datei-Metadaten; Endpoint-Funde erscheinen nur nach
// erfolgreicher kurzer Liveness-Probe. Es wird nie eine Inferenz ausgelöst.
import type { ConfigEntry } from '@shared/contract'
import type { ModelDiscoveryHit } from '@shared/contract-sources'
import { endpointEntries, scanGgufFiles } from './llm-scan'

type FetchLike = (input: string, init?: { method?: string; signal?: AbortSignal }) => Promise<Response>

interface ProbeOptions {
  timeoutMs?: number
  fetchImpl?: FetchLike
}

interface DiscoveryOptions extends ProbeOptions {
  ggufEntries?: ConfigEntry[]
  endpointEntries?: ConfigEntry[]
}

const DEFAULT_TIMEOUT_MS = 800

function modelHit(entry: ConfigEntry): ModelDiscoveryHit {
  return {
    id: entry.id,
    kind: 'gguf',
    label: entry.name,
    path: entry.path,
    detail: entry.desc
  }
}

function endpointProbeUrl(path: string): string {
  if (path.endsWith('/v1')) return `${path}/models`
  if (path.includes('/v1/chat/completions')) return path.replace('/v1/chat/completions', '/v1/models')
  return path.replace(/\/$/, '') + '/v1/models'
}

function endpointHit(entry: ConfigEntry): ModelDiscoveryHit {
  return {
    id: entry.id,
    kind: 'endpoint',
    label: entry.name,
    path: entry.path,
    detail: 'Endpoint erreichbar'
  }
}

async function probeEndpoint(entry: ConfigEntry, options: Required<ProbeOptions>): Promise<ModelDiscoveryHit | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const res = await options.fetchImpl(endpointProbeUrl(entry.path), { method: 'GET', signal: controller.signal })
    return res.ok ? endpointHit(entry) : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function probeEndpointEntries(
  entries: ConfigEntry[],
  options?: ProbeOptions
): Promise<ModelDiscoveryHit[]> {
  const opts: Required<ProbeOptions> = {
    timeoutMs: Math.min(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1000),
    fetchImpl: options?.fetchImpl ?? fetch
  }
  const probed = await Promise.all(entries.map((entry) => probeEndpoint(entry, opts)))
  return probed.filter((hit): hit is ModelDiscoveryHit => hit !== null)
}

export async function discoverLocalModels(options?: DiscoveryOptions): Promise<ModelDiscoveryHit[]> {
  const gguf = options?.ggufEntries ?? scanGgufFiles()
  const endpoints = options?.endpointEntries ?? endpointEntries()
  const liveEndpoints = await probeEndpointEntries(endpoints, options)
  return [...gguf.map(modelHit), ...liveEndpoints]
}
