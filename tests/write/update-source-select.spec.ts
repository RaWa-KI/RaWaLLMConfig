// update-source-select.spec.ts - F4 Quell-Auswahl fuer den Update-Manager.
import { test, expect } from '@playwright/test'
import {
  DEFAULT_RELEASE_URL,
  resolveUpdateSource,
} from '../../src/main/services/update-config'

test.describe('resolveUpdateSource', () => {
  test('RAWALLM_UPDATE_DIR gewinnt vor RAWALLM_RELEASE_URL', () => {
    const source = resolveUpdateSource({
      RAWALLM_UPDATE_DIR: 'C:/updates/local',
      RAWALLM_RELEASE_URL: 'https://updates.example/releases',
    })
    expect(source.describe()).toEqual({ kind: 'local', configured: true })
  })

  test('RAWALLM_RELEASE_URL waehlt HTTPS wenn kein lokaler Ordner gesetzt ist', () => {
    const source = resolveUpdateSource({
      RAWALLM_RELEASE_URL: 'https://updates.example/releases',
    })
    expect(source.describe()).toEqual({ kind: 'https', configured: true })
  })

  test('ohne Env nutzt die oeffentliche GitHub-Release-Quelle', () => {
    expect(DEFAULT_RELEASE_URL).toBe('https://github.com/RaWa-KI/RaWaLLMConfig/releases/latest/download/latest.json')
    const source = resolveUpdateSource({})
    expect(source.describe()).toEqual({ kind: 'https', configured: true })
  })

  test('explizites Env-Objekt faellt nicht auf globale RAWALLM_UPDATE_DIR zurueck', () => {
    const before = process.env.RAWALLM_UPDATE_DIR
    process.env.RAWALLM_UPDATE_DIR = 'C:/global/update-dir'
    try {
      const source = resolveUpdateSource({})
      expect(source.describe()).toEqual({ kind: 'https', configured: true })
    } finally {
      if (before === undefined) delete process.env.RAWALLM_UPDATE_DIR
      else process.env.RAWALLM_UPDATE_DIR = before
    }
  })

  test('ungueltige Release-Adresse gilt als nicht erreichbare Quelle', () => {
    const source = resolveUpdateSource({ RAWALLM_RELEASE_URL: 'disabled-for-tests' })
    expect(source.describe()).toEqual({ kind: 'https', configured: false })
  })
})
