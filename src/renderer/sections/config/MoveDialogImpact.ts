import type { MoveVersionedRequest } from '@shared/contract-write-rename'
import { srcFor, versionSides, type MvVersion } from './move-target'

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
