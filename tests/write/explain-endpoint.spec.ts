import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { explain } from '../../src/main/services/explain'

// WP-4 (B4+B5): Drawer-/Explain-Texte. Pinnt: Klasse `endpoint` wird erkannt,
// `desc` schlaegt GENERIC, kein Zirkelsatz (Text = nur Name), deutsche Umlaute,
// Drawer-Fallback fuer nicht-dateibasierte Eintraege, desc-Verdrahtung im Hook.

test('endpoint explain mit desc: spezifischer Text, kein GENERIC, Umlaute', () => {
  const res = explain({
    kind: 'llm-endpoints',
    name: 'llama-server',
    desc: 'Bekannter Inferenz-Endpoint (llama.cpp, GGUF) — manueller Start, Erreichbarkeit wird nicht geprüft',
  })
  expect(res.error).toBeNull()
  const text = res.data!.text
  // Klassen-Erklaerung fuer Endpoints (kein generischer Fallback).
  expect(text).toContain('Endpoint')
  expect(text).not.toContain('Dieses Element gehört zur LLM-Konfiguration')
  // desc wird als Basis der Erklaerung mitverwendet.
  expect(text).toContain('manueller Start')
  // Laienverstaendliches Deutsch mit echten Umlauten (HR28).
  expect(text).toMatch(/[äöüÄÖÜ]/)
  expect(text).not.toMatch(/\b(ae|oe|ue)[a-z]/)
  // Kein Zirkelsatz: der Text wiederholt nicht einfach nur den Namen.
  expect(text.trim()).not.toBe('llama-server')
})

test('desc schlaegt GENERIC auch bei unbekannter Klasse', () => {
  const res = explain({ kind: 'irgendwas-unbekanntes', name: 'Foo', desc: 'Ein besonderer Helfer für Tests' })
  expect(res.error).toBeNull()
  expect(res.data!.text).toContain('Ein besonderer Helfer für Tests')
})

test('zirkulaere desc (== Name) zaehlt nicht als Erklaerung', () => {
  const res = explain({ kind: 'zzz-unbekannt', name: 'Mein Eintrag', desc: 'Mein Eintrag' })
  expect(res.error).toBeNull()
  // Fallback greift, aber der Text ist nicht nur der Name.
  expect(res.data!.text.trim()).not.toBe('Mein Eintrag')
})

test('GENERIC-Fallback selbst nutzt Umlaute und ist nicht zirkulaer', () => {
  const res = explain({ kind: 'zzz-unbekannt', name: 'Bar' })
  expect(res.error).toBeNull()
  expect(res.data!.text).toMatch(/[äöüÄÖÜ]/)
})

test('Drawer zeigt fuer nicht-dateibasierte Eintraege einen erklaerenden Satz (Source-Pin)', () => {
  const drawer = readFileSync(join(process.cwd(), 'src/renderer/components/Drawer.tsx'), 'utf8')
  expect(drawer).toContain('entry.fileBacked === false')
  expect(drawer).toMatch(/keine eigene Datei/)
})

test('use-explain sendet desc mit der Explain-Anfrage (Source-Pin)', () => {
  const hook = readFileSync(join(process.cwd(), 'src/renderer/sections/config/use-explain.ts'), 'utf8')
  expect(hook).toContain('desc')
})
