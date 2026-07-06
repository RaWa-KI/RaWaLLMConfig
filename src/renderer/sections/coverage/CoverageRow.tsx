import { useState } from 'react'
import type { CoverageRow as CoverageRowData } from '@shared/contract-coverage'
import type { DiffLine } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { CoverageDetail } from './CoverageDetail'
import { CoverageMirrorAction } from './CoverageMirrorAction'
import { CoverageRowHead } from './CoverageRowHead'
import { coverageCandidates, coverageCells } from './coverage-compare'
import { coverageImpact } from './coverage-semantics'

// CoverageRow — eine Zeile der Spiegelungs-Matrix.
// Spalten: Shared / Claude / Codex — Status-Badge je Zelle.
// Bei state 'abweichend' ist die Zeile aufklappbar und zeigt den Inhalts-Diff
// (Reuse bestehende .diff-body/.dline-Klassen aus components.css).
// Auswirkungs-Hinweis (coverageImpact) als laienverstaendliche Info-Zeile.
// Inspect/Compare bleibt read-only; Spiegeln ist eine explizite Write-Aktion.

interface Props {
  row: CoverageRowData
  onInspect(row: CoverageRowData): void
}

// Diff-Anzeige (read-only): reuse .diff-body + .dline-Klassen aus components.css.
// Maskierungs-Pflicht: wenn row.masked, Inhalt nicht zeigen.
function InlineDiff({ lines, masked }: { lines: DiffLine[]; masked?: boolean }) {
  if (masked) {
    return (
      <div className="cvg-row-diff">
        <div className="diff-secret-note">
          {Icon.warn} Inhalt maskiert — Diff bleibt wertfrei; lokale Datei im Owner-Editor oeffnen.
        </div>
      </div>
    )
  }
  return (
    <div className="cvg-row-diff">
      <div className="diff-body">
        {lines.map((l, i) => (
          <div key={i} className={'dline ' + l.t}>
            <span className="dgut">{l.t === 'add' ? '+' : l.t === 'del' ? '−' : ' '}</span>
            <span>{l.l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Impact-Hinweis fuer die Codex-Spalte — nur wenn Codex-State != identisch/vorhanden.
function ImpactHint({ cat, codexState }: { cat: string; codexState: string }) {
  const skip = codexState === 'identisch' || codexState === 'vorhanden'
  if (skip) return null
  const impact = coverageImpact(cat, codexState as Parameters<typeof coverageImpact>[1])
  return (
    <div className="cvg-row-impact">
      <span className="cvg-impact-label">Auswirkung:</span>
      <span className="cvg-impact-text">{impact.text}</span>
      <span className="cvg-impact-src" title={impact.quelle}>({impact.quelle})</span>
    </div>
  )
}

export function CoverageRow({ row, onInspect }: Props) {
  const hasDiff = row.claude.state === 'abweichend' || row.codex.state === 'abweichend'
  const [diffOpen, setDiffOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const candidateCount = coverageCandidates(row).length
  const hasDetail = coverageCells(row).some(({ cell, notes }) => !cell.path || notes.length > 0)
  const isOpen = diffOpen || detailOpen

  function handleInspect() {
    if (candidateCount >= 2) {
      onInspect(row)
      return
    }
    setDetailOpen(true)
  }

  return (
    <div className={'cvg-row' + (isOpen ? ' cvg-row--open' : '')}>
      <CoverageRowHead
        row={row}
        candidateCount={candidateCount}
        hasDetail={hasDetail}
        detailOpen={detailOpen}
        diffOpen={diffOpen}
        hasDiff={hasDiff}
        onInspect={handleInspect}
        onToggleDetail={() => setDetailOpen((v) => !v)}
        onToggleDiff={() => setDiffOpen((v) => !v)}
      />

      <CoverageMirrorAction row={row} />

      {/* Impact-Hinweis */}
      <ImpactHint cat={row.cat} codexState={row.codex.state} />

      {/* Aufgeklappter Diff */}
      {detailOpen && <CoverageDetail row={row} />}

      {diffOpen && hasDiff && row.lines && row.lines.length > 0 && (
        <InlineDiff lines={row.lines} masked={row.masked} />
      )}
      {diffOpen && hasDiff && (!row.lines || row.lines.length === 0) && (
        <div className="cvg-row-diff cvg-row-diff--empty">
          <span className="cvg-impact-text">Diff nicht verfügbar — Inhalt nicht geladen.</span>
        </div>
      )}
    </div>
  )
}
