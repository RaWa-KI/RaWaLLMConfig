import type { MoveImpactScanData, MoveImpactScanResult, MoveVersionedRequest } from '@shared/contract-write-rename'
import { srcFor, versionSides, type MvVersion } from './move-target'

export type MoveRunner = (req: MoveVersionedRequest) => void | Promise<unknown>
export type MoveImpactScanFn = (req: MoveVersionedRequest) => Promise<MoveImpactScanResult>

export function moveRequests(
  v: MvVersion,
  sharedPath: string | undefined,
  claudePath: string | undefined,
  to: string
): MoveVersionedRequest[] {
  return versionSides(v, sharedPath, claudePath)
    .map((side) => {
      const from = srcFor(side, sharedPath, claudePath)
      return from ? { version: side, fromPath: from, to } : null
    })
    .filter((req): req is MoveVersionedRequest => req !== null)
}

export function requestKey(reqs: MoveVersionedRequest[]): string {
  return reqs.map((r) => `${r.version}:${r.fromPath}->${r.to}`).join('|')
}

export async function runMoves(reqs: MoveVersionedRequest[], onMove: MoveRunner): Promise<void> {
  for (const req of reqs) await onMove(req)
}

export async function scanMoveRequests(
  reqs: MoveVersionedRequest[],
  scan: MoveImpactScanFn
): Promise<MoveImpactScanData | null> {
  const results: MoveImpactScanData[] = []
  for (const req of reqs) {
    const res = await scan(req)
    if (res.error || !res.data) return null
    results.push(res.data)
  }
  return combineImpact(results)
}

function combineImpact(items: MoveImpactScanData[]): MoveImpactScanData {
  const first = items[0]
  return {
    version: first?.version ?? 'shared',
    fromPath: first?.fromPath ?? '',
    to: first?.to ?? '',
    searchedFor: Array.from(new Set(items.flatMap((item) => item.searchedFor))),
    findings: items.flatMap((item) => item.findings),
    scannedFiles: items.reduce((sum, item) => sum + item.scannedFiles, 0),
    skipped: {
      ignored: items.reduce((sum, item) => sum + item.skipped.ignored, 0),
      binary: items.reduce((sum, item) => sum + item.skipped.binary, 0),
      secret: items.reduce((sum, item) => sum + item.skipped.secret, 0),
      oversize: items.reduce((sum, item) => sum + item.skipped.oversize, 0)
    },
    truncated: items.some((item) => item.truncated)
  }
}
