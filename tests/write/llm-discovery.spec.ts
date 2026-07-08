import { test, expect } from '@playwright/test'
import type { ConfigEntry } from '@shared/contract'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { probeEndpointEntries } from '../../src/main/scan/llm-discovery'
import { scanGgufFiles } from '../../src/main/scan/llm-scan'

function endpoint(id: string, path: string): ConfigEntry {
  return {
    id,
    name: id,
    status: 'stale',
    scope: 'local',
    path,
    desc: 'Endpoint',
    updated: '',
    fields: {}
  }
}

test('probeEndpointEntries listet nur per Liveness erreichbare Endpoints', async () => {
  const entries = [
    endpoint('live', 'http://127.0.0.1:11434/v1'),
    endpoint('dead', 'http://127.0.0.1:65535/v1')
  ]
  const fetchImpl = async (url: string): Promise<Response> => {
    if (url.includes('11434')) return new Response('{}', { status: 200 })
    throw new Error('ECONNREFUSED')
  }
  const hits = await probeEndpointEntries(entries, { timeoutMs: 50, fetchImpl })
  expect(hits.map((hit) => hit.id)).toEqual(['live'])
  expect(hits[0].detail).toBe('Endpoint erreichbar')
})

test('probeEndpointEntries wertet 404 nicht als erreichbares Modell-API', async () => {
  const fetchImpl = async (): Promise<Response> => new Response('{}', { status: 404 })
  const hits = await probeEndpointEntries([endpoint('missing', 'http://127.0.0.1:1234/v1')], {
    timeoutMs: 50,
    fetchImpl
  })
  expect(hits).toEqual([])
})

test('scanGgufFiles findet GGUF-Dateien in gewaehlt uebergebenem Modellordner', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-gguf-'))
  const family = join(root, 'qwen')
  mkdirSync(family)
  writeFileSync(join(family, 'qwen3.gguf'), 'model')
  writeFileSync(join(family, 'notes.txt'), 'ignore')

  const hits = scanGgufFiles([root])
  expect(hits.map((hit) => hit.name)).toEqual(['qwen3.gguf'])
  expect(hits[0].path).toBe(join(family, 'qwen3.gguf'))
  expect(hits[0].fields.Modell).toBe('qwen')
})
