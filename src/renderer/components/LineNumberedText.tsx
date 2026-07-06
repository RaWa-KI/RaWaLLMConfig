import { useMemo, useState } from 'react'
import './LineNumberedText.css'

interface PreProps {
  content: string
  className?: string
}

interface TextareaProps {
  value: string
  className?: string
  ariaLabel: string
  spellCheck?: boolean
  onChange(value: string): void
}

function linesOf(content: string): string[] {
  return content.replace(/\r\n?/g, '\n').split('\n')
}

function lineNumbers(count: number): number[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => i + 1)
}

export function LineNumberedPre({ content, className }: PreProps) {
  const lines = useMemo(() => linesOf(content), [content])
  return (
    <div className={'line-pre ' + (className ?? '')}>
      {lines.map((line, i) => (
        <div className="line-pre-row" key={i}>
          <span className="line-num">{i + 1}</span>
          <span className="line-pre-code">{line || '\u00a0'}</span>
        </div>
      ))}
    </div>
  )
}

export function LineNumberedTextarea({
  value,
  className,
  ariaLabel,
  spellCheck = false,
  onChange
}: TextareaProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const nums = useMemo(() => lineNumbers(linesOf(value).length), [value])
  return (
    <div className={'line-editor ' + (className ?? '')}>
      <div className="line-editor-gutter" aria-hidden="true">
        <div style={{ transform: `translateY(${-scrollTop}px)` }}>
          {nums.map((n) => <span className="line-num" key={n}>{n}</span>)}
        </div>
      </div>
      <textarea
        className="line-editor-text"
        value={value}
        wrap="off"
        spellCheck={spellCheck}
        aria-label={ariaLabel}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
