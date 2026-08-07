import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Category, ConfigEntry } from '../../shared/contract'

// WP-F11: „Technisches Detail" in den Config-Warnungen nennt Eintraege nicht
// mehr nur als toten Namenstext, sondern als klickbare Verweise, die den
// Drawer des Eintrags oeffnen (openEntry(catId, entryId) → Eintrag + Pfad).
// Verhaltenstests laufen gegen die reinen Builder-/Kappungs-Funktionen; die
// Klick-Verdrahtung und die Link-Optik werden per Source-Pin gesichert
// (tests/write hat bewusst kein Browser-Setup — Muster: conflict-compare-entry.spec.ts).

// CSS-Importe der Renderer-Module sind fuer den Node-Runner unlesbar -> Stub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(require as any).extensions['.css'] = () => undefined
// eslint-disable-next-line @typescript-eslint/no-var-requires
const diag = require('../../src/renderer/sections/config/ConfigDiagnostics') as
  typeof import('../../src/renderer/sections/config/ConfigDiagnostics')

const src = read('src/renderer/sections/config/ConfigDiagnostics.tsx')
const css = read('src/renderer/sections/config/ConfigDiagnostics.css')

function entry(p: Partial<ConfigEntry> & { id: string; name: string }): ConfigEntry {
  return {
    scope: 'global',
    status: 'active',
    desc: '',
    updated: '2026-08-07',
    ...p,
  } as ConfigEntry
}

function category(entries: ConfigEntry[]): Category {
  return { id: 'skills', label: 'Skills', icon: 'list', path: '~/.claude/skills', blurb: '', entries }
}

test('Diagnostics fuehren refs mit entryId statt reiner Namensliste', () => {
  const hinted = ['a', 'b', 'c'].map((id) =>
    entry({ id, name: `skill-${id}`, fields: { 'Frontmatter-Hinweis': 'unbekannter Schluessel' } })
  )
  const clean = entry({ id: 'z', name: 'sauber' })
  const [d] = diag.frontmatterDiagnostics(category([...hinted, clean]))
  // Jeder Verweis traegt die Ziel-ID fuer openEntry — der saubere Eintrag fehlt.
  expect(d.refs?.map((r) => r.entryId)).toEqual(['a', 'b', 'c'])
  expect(d.refs?.map((r) => r.name)).toEqual(['skill-a', 'skill-b', 'skill-c'])
})

test('tokenDiagnostics behaelt den Token-Zusatz im Verweisnamen', () => {
  const heavy = entry({ id: 'h1', name: 'dicker-skill', tokensEstimated: 5000 })
  const [d] = diag.tokenDiagnostics(category([heavy, entry({ id: 'l1', name: 'leicht' })]))
  expect(d.refs).toEqual([{ entryId: 'h1', name: 'dicker-skill (ca. 5000 Tokens)' }])
})

test('Kappung: maximal 4 Verweise sichtbar, Rest als hiddenCount („+ n weitere")', () => {
  const refs = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ entryId: id, name: id }))
  const capped = diag.capRefs(refs)
  expect(diag.REF_CAP).toBe(4)
  expect(capped.shown.map((r) => r.entryId)).toEqual(['a', 'b', 'c', 'd'])
  expect(capped.hiddenCount).toBe(2)
  // Unter der Kappe bleibt alles sichtbar, kein Rest-Label.
  expect(diag.capRefs(refs.slice(0, 3))).toEqual({ shown: refs.slice(0, 3), hiddenCount: 0 })
  // Das Rest-Label steht im Render-Pfad an der Kappung.
  expect(src).toContain('{hiddenCount > 0 && ` ${MORE_LABEL(hiddenCount)}`}')
  expect(src).toContain("const MORE_LABEL = (n: number) => `+ ${n} weitere`")
})

test('Klick auf einen Detail-Verweis oeffnet den Drawer des Eintrags', () => {
  // Verdrahtung: Verweis-Klick → openEntry(catId, entryId) → Drawer (Eintrag + Pfad).
  expect(src).toContain('onClick={() => actions.openEntry(props.catId, ref.entryId)}')
  expect(src).toContain('<DiagnosticDetail catId={cat.id} detail={item.detail} refs={item.refs} />')
  // Kein toter Namenstext mehr im Detail.
  expect(src).not.toContain('names?: string[]')
  expect(src).not.toContain("item.names?.join(', ')")
})

test('Verweise sind dezente unterstrichene Links, keine Button-Optik', () => {
  expect(src).toContain('className="cfg-diag-ref"')
  const rule = css.slice(css.indexOf('.cfg-diag-ref {'))
  expect(rule).toContain('text-decoration: underline;')
  expect(rule).toContain('border: 0;')
  expect(rule).toContain('background: transparent;')
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
