// src/renderer/sections/referenz/CopyChip.tsx
// Kleiner Kopier-Button: legt den uebergebenen Text in die Zwischenablage und zeigt
// kurz „kopiert". Praesentational, props-getrieben, eigenes lokales Feedback (useState).
// Klassennamen prototyp-nah (ref-copy / .ok), damit die separate CSS-Datei greift.
import { useState } from 'react'
import { Icon } from '../../components/Icon'

interface CopyChipProps {
  text: string
  label?: string
}

export function CopyChip({ text, label = 'kopieren' }: CopyChipProps) {
  const [copied, setCopied] = useState(false)

  // Kopiert via Clipboard-API; bei Fehler still bleiben (Feedback trotzdem zeigen).
  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      void navigator.clipboard?.writeText(text)
    } catch {
      /* Clipboard nicht verfuegbar — kein Wert-Output, nur kein Feedback-Wert. */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1300)
  }

  return (
    <button className={'ref-copy' + (copied ? ' ok' : '')} onClick={onCopy} type="button">
      {copied ? Icon.check : Icon.save}
      {copied ? 'kopiert' : label}
    </button>
  )
}
