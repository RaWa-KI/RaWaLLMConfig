import { test, expect } from '@playwright/test'
import type { AppData } from '../../shared/contract'
import { createConfigScanCache } from '../../src/main/services/config-scan-cache'

function appData(label: string): AppData {
  return {
    snapshot: { frozen: false, date: label, label },
    machines: [],
    llms: [],
    data: {}
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('parallel calls join one in-flight scan', async () => {
  let calls = 0
  const first = deferred<AppData>()
  const cache = createConfigScanCache(() => {
    calls += 1
    return first.promise
  })

  const a = cache.getSnapshot({ reason: 'a' })
  const b = cache.getSnapshot({ reason: 'b' })
  expect(calls).toBe(1)

  const data = appData('first')
  first.resolve(data)
  await expect(a).resolves.toBe(data)
  await expect(b).resolves.toBe(data)
  expect(cache.getMeta()?.status).toBe('scan')
})

test('second call returns cached snapshot without scanning', async () => {
  let calls = 0
  const data = appData('cached')
  const cache = createConfigScanCache(() => {
    calls += 1
    return data
  })

  await expect(cache.getSnapshot()).resolves.toBe(data)
  await expect(cache.getSnapshot({ reason: 'second' })).resolves.toBe(data)

  expect(calls).toBe(1)
  expect(cache.getMeta()?.status).toBe('hit')
})

test('stale marker and force trigger rescans', async () => {
  let calls = 0
  const cache = createConfigScanCache(() => {
    calls += 1
    return appData(`scan-${calls}`)
  })

  const first = await cache.getSnapshot()
  cache.markStale('fs-change')
  const second = await cache.getSnapshot()
  const third = await cache.getSnapshot({ force: true, reason: 'manual-refresh' })

  expect(first.snapshot.label).toBe('scan-1')
  expect(second.snapshot.label).toBe('scan-2')
  expect(third.snapshot.label).toBe('scan-3')
  expect(calls).toBe(3)
  expect(cache.getMeta()?.reason).toBe('manual-refresh')
})

// F2: Wird waehrend eines laufenden Scans eine Aenderung gemeldet, darf der noch
// laufende (aeltere) Lauf das Stale-Flag NICHT loeschen — sonst liefert der
// Cache dauerhaft den alten Stand aus (eingefrorene Zaehler/Listen).
test('markStale waehrend eines laufenden Scans geht nicht verloren', async () => {
  let calls = 0
  const first = deferred<AppData>()
  const cache = createConfigScanCache(() => {
    calls += 1
    return calls === 1 ? first.promise : appData(`scan-${calls}`)
  })

  const running = cache.getSnapshot({ reason: 'initial' })
  // Aenderung trifft ein, WAEHREND der erste Scan noch laeuft.
  cache.markStale('fs-change')
  first.resolve(appData('scan-1'))
  await expect(running).resolves.toHaveProperty('snapshot.label', 'scan-1')

  // Stale-Flag ueberlebt den alten Lauf.
  expect(cache.getMeta()?.stale).toBe(true)

  // Der naechste Abruf liefert frische Daten statt des veralteten Standes.
  const next = await cache.getSnapshot({ reason: 'after-change' })
  expect(next.snapshot.label).toBe('scan-2')
  expect(calls).toBe(2)
  expect(cache.getMeta()?.stale).toBe(false)
})

// Ein Abruf, der WAEHREND eines veralteten Laufs kommt, darf sich nicht an
// diesen anhaengen — er braucht einen Lauf, der die Aenderung schon sieht.
test('getSnapshot joint keinen Scan, der vor der Stale-Markierung startete', async () => {
  let calls = 0
  const first = deferred<AppData>()
  const cache = createConfigScanCache(() => {
    calls += 1
    return calls === 1 ? first.promise : appData(`scan-${calls}`)
  })

  const running = cache.getSnapshot({ reason: 'initial' })
  cache.markStale('fs-change')
  const joined = cache.getSnapshot({ reason: 'after-change' })

  first.resolve(appData('scan-1'))
  await expect(running).resolves.toHaveProperty('snapshot.label', 'scan-1')
  // Der zweite Abruf bekommt NICHT das Ergebnis des veralteten Laufs.
  await expect(joined).resolves.toHaveProperty('snapshot.label', 'scan-2')
  expect(calls).toBe(2)
})
