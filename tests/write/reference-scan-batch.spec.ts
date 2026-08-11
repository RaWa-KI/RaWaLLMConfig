// reference-scan-batch.spec.ts — Aequivalenz-Nachweis fuer den Batch-Scan.
// scanReferencesBatch walkt den Baum EINMAL und liest jede Datei EINMAL, wertet
// den Inhalt danach gegen alle alt→neu-Paare aus (Schleifen-Umkehr Datei→Paar).
// Diese Spec pinnt, dass dabei je Paar exakt dasselbe herauskommt wie beim
// getrennten Einzel-Scan — inklusive Blocker, manualRequired und scannedFiles,
// und ohne Kreuz-Kontamination zwischen den Paaren.
// Temp-Sandbox only, keine Realpfade, keine Secrets.
import { test, expect } from '@playwright/test'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import { slash, writeText } from './integrity-helpers'
import {
  scanReferences,
  scanReferencesBatch,
  type ScanPair
} from '../../src/main/services/integrity/reference-scan'

// Sandbox mit allen Klassifikations-Faellen: normaler Treffer, Secret-Datei,
// kaputtes JSON (nur Paar 1 betroffen) und ambiger Wikilink (nur Paar 2).
function seedSandbox(): { pairs: ScanPair[]; roots: string[] } {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const oldA = sandboxPath(sb, 'skills', 'alpha', 'SKILL.md')
  const newA = sandboxPath(sb, 'userglobal', 'skills', 'alpha', 'SKILL.md')
  const oldB = sandboxPath(sb, 'rules', 'beta-alt.md')
  const newB = sandboxPath(sb, 'rules', 'beta-neu.md')
  const oldC = sandboxPath(sb, 'agents', 'gamma.md')
  const newC = sandboxPath(sb, 'userglobal', 'agents', 'gamma.md')

  writeText(oldA, '# Alpha\n')
  writeText(oldB, '# Beta\n')
  writeText(oldC, '# Gamma\n')

  // Fremdes Artefakt mit Basename 'beta-alt' → Wikilink von Paar 2 ist ambig.
  writeText(sandboxPath(sb, 'notes', 'beta-alt.md'), '# anderes beta-alt\n')

  // Treffer-Datei fuer alle drei Paare (Pfad- und Wikilink-Formen gemischt).
  writeText(sandboxPath(sb, 'docs', 'surface.md'), [
    `Alpha: ${slash(oldA)}`,
    `Beta: ${slash(oldB)}`,
    `Gamma: ${slash(oldC)}`,
    'Siehe [[beta-alt]] und [[gamma]].'
  ].join('\n'))

  // Governance-JSON (valide) nur mit Bezug zu Paar 3.
  writeText(
    sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json'),
    JSON.stringify({ skills: { gamma: { canonical_source: oldC, loader_path: oldC } } }, null, 2)
  )

  // Kaputtes JSON nur mit Bezug zu Paar 1 → manualRequired ausschliesslich dort.
  writeText(sandboxPath(sb, 'config', 'broken.json'), `{ "path": "${slash(oldA)}", KAPUTT `)

  // Secret-artige Datei → manualRequired in JEDEM Paar, Inhalt wird nie gelesen.
  writeText(sandboxPath(sb, 'auth.json'), JSON.stringify({ loader_path: slash(oldA) }))

  // Binaerdatei mit Text-Extension → manualRequired 'binary' in jedem Paar.
  writeText(sandboxPath(sb, 'docs', 'binary.md'), `Bin\0${slash(oldA)}`)

  return {
    pairs: [
      { oldPath: oldA, newPath: newA },
      { oldPath: oldB, newPath: newB },
      { oldPath: oldC, newPath: newC }
    ],
    roots: [sb.configDir]
  }
}

test('scanReferencesBatch liefert je Paar dasselbe Ergebnis wie der Einzel-Scan', async () => {
  const { pairs, roots } = seedSandbox()
  const opts = { allowedRoots: roots }

  const batch = await scanReferencesBatch(pairs, opts)
  const single = []
  for (const pair of pairs) {
    single.push(await scanReferences(pair.oldPath, pair.newPath, opts))
  }

  expect(batch).toHaveLength(pairs.length)
  for (let i = 0; i < pairs.length; i++) {
    expect(batch[i]).toEqual(single[i])
  }

  // Gegenprobe, dass die Sandbox die Sonderfaelle wirklich abdeckt:
  // Paar 2 traegt den ambiguous-wikilink-Blocker, die anderen nicht.
  expect(batch[0].blockers).toHaveLength(0)
  expect(batch[1].blockers.map((b) => b.code)).toEqual(['ambiguous-wikilink'])
  expect(batch[2].blockers).toHaveLength(0)

  // Kaputtes JSON ist nur fuer Paar 1 manualRequired, Secret/Binary fuer alle.
  const brokenIn = (index: number): boolean =>
    batch[index].manualRequired.some((m) => m.reason.startsWith('invalid-json'))
  expect(brokenIn(0)).toBe(true)
  expect(brokenIn(1)).toBe(false)
  expect(brokenIn(2)).toBe(false)
  for (const result of batch) {
    expect(result.manualRequired.some((m) => m.reason.startsWith('secret-skip'))).toBe(true)
    expect(result.manualRequired.some((m) => m.reason === 'binary')).toBe(true)
  }

  // Alle drei Paare finden ihren Pfad-Treffer in docs/surface.md.
  for (const result of batch) {
    expect(result.ops.length).toBeGreaterThan(0)
  }
})

test('scanReferencesBatch ohne allowedRoots liefert leere Ergebnisse je Paar', async () => {
  const { pairs } = seedSandbox()
  const batch = await scanReferencesBatch(pairs, { allowedRoots: [] })

  expect(batch).toHaveLength(pairs.length)
  for (const result of batch) {
    expect(result).toEqual({
      ops: [], blockers: [], manualRequired: [], scannedFiles: 0, truncated: false
    })
  }
})

test('scanReferencesBatch ignoriert unwirksame Paare, ohne die anderen zu stoeren', async () => {
  const { pairs, roots } = seedSandbox()
  const opts = { allowedRoots: roots }

  // Paar mit identischem alt/neu und Paar ohne Ziel sind wirkungslos (leer),
  // duerfen aber die Ergebnisse der gueltigen Paare nicht veraendern.
  const mixed: ScanPair[] = [
    { oldPath: pairs[0].oldPath, newPath: pairs[0].oldPath },
    pairs[0],
    { oldPath: pairs[1].oldPath, newPath: '' }
  ]
  const batch = await scanReferencesBatch(mixed, opts)
  const reference = await scanReferences(pairs[0].oldPath, pairs[0].newPath, opts)

  expect(batch[0].ops).toHaveLength(0)
  expect(batch[0].manualRequired).toHaveLength(0)
  expect(batch[1]).toEqual(reference)
  expect(batch[2].ops).toHaveLength(0)
  expect(batch[2].manualRequired).toHaveLength(0)
})
