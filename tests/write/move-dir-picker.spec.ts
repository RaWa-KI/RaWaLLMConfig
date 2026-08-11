// move-dir-picker.spec.ts — Sicherheit (Finding A, Weg 2): das Ziel des Ordner-
// Verschiebens kommt aus dem nativen Main-Ordnerdialog (pickFolder), NICHT aus
// dem renderer-gelieferten req.to. Belegt: der Dialog-Pfad gewinnt, ein
// untergeschobenes req.to wird ignoriert; Dialog-Abbruch (pick null) => still
// 'move-cancelled' ohne jede Mutation. Alle Pfade Sandbox, keine echten Homes.
import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import { writeText } from './integrity-helpers'
import { handleMoveDir } from '../../src/main/ipc-write-dir'

test('move-dir: Ziel kommt aus dem Dialog (pick), untergeschobenes req.to wird ignoriert', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)
  // Quell-Ordner mit Inhalt unter der erlaubten Wurzel.
  const src = sandboxPath(sb, 'skills', 'to-move')
  writeText(join(src, 'SKILL.md'), '# Move me\n')
  // Ziel-Ordner, den der "Dialog" liefert (owner-gewaehlt).
  const destParent = sandboxPath(sb, 'ziel')
  writeText(join(destParent, '.keep'), '')
  // Abweichendes req.to, das ein kompromittierter Renderer setzen wuerde.
  const attacker = sandboxPath(sb, 'boese', 'attacker-ziel')

  const res = await handleMoveDir(
    { action: 'move-dir', path: src, to: attacker },
    { pick: async () => destParent, getCtx: () => ({ archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir], sandboxRoot: null }) }
  )

  expect(res.error).toBeNull()
  expect(res.data).not.toBeNull()
  // Landung im Dialog-Ordner unter eigenem Namen — NICHT im untergeschobenen Pfad.
  const landed = join(destParent, basename(src))
  expect(existsSync(join(landed, 'SKILL.md'))).toBe(true)
  expect(existsSync(attacker)).toBe(false)
  // Quelle ist verschoben (nicht mehr am alten Ort).
  expect(existsSync(src)).toBe(false)
})

test('move-dir: Dialog-Abbruch (pick null) => move-cancelled, keine Mutation', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)
  const src = sandboxPath(sb, 'skills', 'stay')
  writeText(join(src, 'SKILL.md'), '# Stay\n')

  const res = await handleMoveDir(
    { action: 'move-dir', path: src, to: sandboxPath(sb, 'egal') },
    { pick: async () => null, getCtx: () => ({ archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir], sandboxRoot: null }) }
  )

  expect(res.data).toBeNull()
  expect(res.error).toBe('move-cancelled')
  // Quelle unangetastet.
  expect(existsSync(join(src, 'SKILL.md'))).toBe(true)
})
