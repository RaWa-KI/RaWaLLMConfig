import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { getLocale } from '@shared/messages'
import { sameFileCompareText } from '@shared/messages/compare-same-file'
import type { SameFileGroup } from './same-file-candidates'
import './SameFileComparePanel.css'

interface Props {
  groups: SameFileGroup[]
  onCompare(group: SameFileGroup): void
}

export function SameFileComparePanel({ groups, onCompare }: Props) {
  const initialName = useMemo(() => groups.find((g) => g.basename === 'AGENTS.md')?.basename ?? groups[0]?.basename, [groups])
  const [selectedName, setSelectedName] = useState(initialName ?? '')
  const selected = groups.find((group) => group.basename === selectedName) ?? groups[0]
  const agents = groups.find((group) => group.basename === 'AGENTS.md')
  const canCompare = selected ? selected.status === 'ready' && selected.candidates.length >= 2 : false
  const locale = getLocale()

  return (
    <section className="cmp-same" aria-label={msg('compare.sameFile.aria')}>
      <div className="cmp-same-head">
        <div>
          <strong>{msg('compare.sameFile.title')}</strong>
          <span>{msg('compare.sameFile.subtitle')}</span>
        </div>
        {agents && (
          <button type="button" className="cmp-same-quick" onClick={() => setSelectedName(agents.basename)}>
            {Icon.diff} {msg('compare.sameFile.quickAgents')}
          </button>
        )}
      </div>
      {selected ? (
        <>
          <SameFileChoices groups={groups} selectedName={selected.basename} onSelect={setSelectedName} />
          <div className={'cmp-same-status ' + selected.status}>
            {statusIcon(selected.status)} {statusText(selected, locale)}
          </div>
          <div className="cmp-same-places">
            {selected.candidates.map((candidate) => (
              <span key={`${candidate.path}:${candidate.origin}`} className="cmp-same-place">
                <strong>{candidate.origin ?? sameFileCompareText(locale, 'originUnknown')}</strong>
                <span className="mono">{candidate.path}</span>
              </span>
            ))}
          </div>
          <button type="button" className="cmp-same-go" disabled={!canCompare} onClick={() => onCompare(selected)}>
            {Icon.diff} {msg('compare.sameFile.go')}
          </button>
        </>
      ) : (
        <div className="cmp-same-empty">{Icon.note} {msg('compare.sameFile.empty')}</div>
      )}
    </section>
  )
}

function SameFileChoices({
  groups,
  selectedName,
  onSelect,
}: {
  groups: SameFileGroup[]
  selectedName: string
  onSelect(name: string): void
}) {
  return (
    <div className="cmp-same-choices" role="listbox" aria-label={msg('compare.sameFile.chooseAria')}>
      {groups.map((group) => (
        <button
          key={group.basename}
          type="button"
          className={'cmp-same-choice' + (group.basename === selectedName ? ' on' : '')}
          onClick={() => onSelect(group.basename)}
        >
          <span className="mono">{group.basename}</span>
          <small>{sameFileCompareText(getLocale(), 'placeCount', { count: String(group.candidates.length) })}</small>
        </button>
      ))}
    </div>
  )
}

function statusText(group: SameFileGroup, locale: ReturnType<typeof getLocale>): string {
  if (group.status === 'ready') {
    return sameFileCompareText(locale, 'statusReady', { count: String(group.candidates.length) })
  }
  if (group.status === 'partial') return sameFileCompareText(locale, 'statusPartial')
  return sameFileCompareText(locale, 'statusAmbiguous')
}

function statusIcon(status: SameFileGroup['status']) {
  if (status === 'ready') return Icon.check
  if (status === 'partial') return Icon.note
  return Icon.warn
}
