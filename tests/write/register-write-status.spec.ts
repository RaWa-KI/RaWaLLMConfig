// register-write-status.spec.ts — Registrar-Ausfaelle muessen in write:status
// sichtbar werden. Der Status enthaelt nur Gruppennamen, keine Stacks/Pfade.
import { test, expect } from '@playwright/test'
import { safeRegister } from '../../src/main/register-write'
import {
  clearWriteRegistrarFailures,
  getWriteStatus
} from '../../src/main/services/write-mode'

test.beforeEach(() => {
  clearWriteRegistrarFailures()
})

test.afterEach(() => {
  clearWriteRegistrarFailures()
})

test('safeRegister sammelt ausgefallene Registrar-Gruppe fuer Status-Surface', () => {
  safeRegister('sources', () => {
    throw new Error('C:/secret/path/token=123')
  })

  const status = getWriteStatus()
  expect(status.registrarFailures).toEqual(['sources'])
  expect(JSON.stringify(status)).not.toContain('secret')
  expect(JSON.stringify(status)).not.toContain('token')
})

test('safeRegister laesst App bei Registrar-Throw weiter nutzbar', () => {
  let okRegistrarCalled = false
  safeRegister('integrity', () => {
    throw new Error('kaputt')
  })
  safeRegister('sources', () => {
    okRegistrarCalled = true
  })

  expect(okRegistrarCalled).toBe(true)
  expect(getWriteStatus().registrarFailures).toEqual(['integrity'])
})
