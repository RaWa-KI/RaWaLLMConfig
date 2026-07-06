import type { CoverageRow } from '@shared/contract-coverage'
import type { WriteAction } from '@shared/contract-write'

export type MirrorFamily = 'claude' | 'codex'
type SourceFamily = 'shared' | MirrorFamily

const FAMILY_LABEL: Record<SourceFamily, string> = {
  shared: 'Shared',
  claude: 'Claude',
  codex: 'Codex'
}

export interface CoverageMirrorPlan {
  targetFamily: MirrorFamily
  sourceFamily: SourceFamily
  sourcePath: string | null
  targetPath: string | null
  action: WriteAction
  buttonLabel: string
  confirmLabel: string
  disabledReason: string | null
}

function mirrorState(row: CoverageRow, target: MirrorFamily): boolean {
  const state = row[target].state
  return state === 'fehlt' || state === 'abweichend'
}

function sourceOrder(target: MirrorFamily): SourceFamily[] {
  return target === 'claude' ? ['shared', 'codex'] : ['shared', 'claude']
}

function pickSource(row: CoverageRow, target: MirrorFamily): SourceFamily | null {
  return sourceOrder(target).find((family) => !!row[family].path) ?? null
}

function disabledReason(row: CoverageRow, target: MirrorFamily, source: SourceFamily | null): string | null {
  if (row.masked) return 'Nicht gespiegelt: Inhalt ist maskiert.'
  if (!source) return 'Nicht gespiegelt: keine vorhandene Quellseite gefunden.'
  if (!row[target].path) return 'Nicht gespiegelt: Zielpfad fehlt im Scan.'
  return null
}

export function coverageMirrorPlan(row: CoverageRow, target: MirrorFamily): CoverageMirrorPlan | null {
  if (!mirrorState(row, target)) return null
  const source = pickSource(row, target)
  const action: WriteAction = row[target].state === 'fehlt' ? 'add' : 'edit'
  return {
    targetFamily: target,
    sourceFamily: source ?? 'shared',
    sourcePath: source ? row[source].path ?? null : null,
    targetPath: row[target].path ?? null,
    action,
    buttonLabel: `${FAMILY_LABEL[target]} spiegeln`,
    confirmLabel: `${FAMILY_LABEL[target]} mit ${source ? FAMILY_LABEL[source] : 'Quelle'} spiegeln: ${row.name}`,
    disabledReason: disabledReason(row, target, source)
  }
}

export function coverageMirrorPlans(row: CoverageRow): CoverageMirrorPlan[] {
  return (['claude', 'codex'] as MirrorFamily[])
    .map((family) => coverageMirrorPlan(row, family))
    .filter((plan): plan is CoverageMirrorPlan => plan !== null)
}
