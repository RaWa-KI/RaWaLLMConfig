import './ExplainPanel.css'

// ExplainPanel — zeigt die laienverstaendliche "Was macht das?"-Erklaerung pro
// Element (F5). REIN praesentierend: Titel/Text/Loading/Error kommen via Props
// (kein Direkt-IPC im Body). Das Holen der Erklaerung (config:explain ueber den
// Store) und das Einhaengen in ConfigSection/Drawer macht Welle 3 (WP-INT).
export interface ExplainPanelProps {
  title: string | null
  text: string | null
  loading?: boolean
  error?: string | null
}

export function ExplainPanel({ title, text, loading, error }: ExplainPanelProps) {
  return (
    <div className="explain-panel card flat">
      <div className="explain-head">
        <span className="explain-q" aria-hidden="true">?</span>
        <span className="explain-label">Was macht das?</span>
      </div>
      {loading ? (
        <p className="explain-muted">Lädt…</p>
      ) : error ? (
        <p className="explain-muted">{error}</p>
      ) : text ? (
        <div className="explain-body">
          {title && <div className="explain-title">{title}</div>}
          <p className="explain-text">{text}</p>
        </div>
      ) : (
        <p className="explain-muted">Element auswählen für eine Erklärung.</p>
      )}
    </div>
  )
}
