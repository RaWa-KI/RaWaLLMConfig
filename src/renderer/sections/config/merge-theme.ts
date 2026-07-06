import { EditorView } from 'codemirror'
import type { Extension } from '@codemirror/state'

// On-Brand-Theme fuer den CM-MergeView (alle 5 App-Themes). HR27-Split aus
// MergeEditor.tsx. Nutzt CSS-Variablen aus tokens.css — diese werden vom Browser
// dynamisch aufgeloest, wenn html[data-theme] wechselt -> keine Compartment-Reaktion
// noetig. EditorView.theme() ueberschreibt CM-basicSetup-Styles korrekt (hoechste Prio).
export function buildMergeTheme(): Extension {
  return EditorView.theme({
    '&': {
      background: 'var(--bg-card)',
      color: 'var(--text)',
    },
    '.cm-content': {
      background: 'var(--bg-card)',
      caretColor: 'var(--terra)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--terra)',
    },
    '.cm-gutters': {
      background: 'var(--bg)',
      color: 'var(--text-lt)',
      border: 'none',
      borderRight: '1px solid var(--border)',
    },
    '.cm-activeLineGutter': {
      background: 'var(--bg-card)',
    },
    '.cm-activeLine': {
      background: 'color-mix(in oklab, var(--terra) 6%, transparent)',
    },
    '.cm-selectionBackground, ::selection': {
      background: 'color-mix(in oklab, var(--papa) 22%, transparent)',
    },
    '.cm-changedLine': {
      background: 'color-mix(in oklab, var(--sage-lt) 70%, transparent)',
    },
    '.cm-changedText': {
      background: 'color-mix(in oklab, var(--sage) 30%, transparent)',
      borderRadius: '2px',
    },
    '.cm-deletedLine': {
      background: 'color-mix(in oklab, var(--terra-lt) 70%, transparent)',
    },
    '.cm-deletedChunk': {
      background: 'color-mix(in oklab, var(--terra) 18%, transparent)',
    },
    '.cm-mergeGap': {
      background: 'var(--bg)',
    },
  })
}
