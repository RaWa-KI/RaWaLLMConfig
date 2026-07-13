import { Component, type ErrorInfo, type ReactNode } from 'react'
import {
  buildErrorReportRequest,
  deriveErrorBoundaryState,
  sanitizeComponentStack,
  type ErrorBoundaryState
} from './error-boundary-state'

// A8-6, Stufe 2: globale Auffangschicht fuer den Renderer. Ein Render-Throw in
// einem Kind wuerde sonst ein WEISSES Fenster erzeugen (React unmountet den Baum).
// Diese Klassen-Komponente faengt den Fehler, loggt nur die Klartext-message
// (secret-frei — kein Objekt-/Stack-Dump) und zeigt eine gestylte, laien-
// verstaendliche Fehlerseite mit "Neu laden"-Knopf statt des leeren Fensters.
interface Props {
  children: ReactNode
}
export class ErrorBoundary extends Component<Props, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    msg: '',
    source: 'React ErrorBoundary',
    componentStack: null,
    reportStatus: null,
    reportBusy: false
  }

  // React-Lifecycle: aus dem Fehler den neuen State ableiten (rendert Fallback).
  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return deriveErrorBoundaryState(err)
  }

  // Nur loggen (secret-frei): message + Komponenten-Herkunft, nie das ganze Objekt.
  componentDidCatch(err: unknown, info: ErrorInfo): void {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[renderer] ErrorBoundary', msg)
    this.setState({ componentStack: sanitizeComponentStack(info.componentStack) })
  }

  private saveReport = async (): Promise<void> => {
    const api = window.electronAPI
    if (!api?.saveErrorReport) {
      this.setState({ reportStatus: 'Fehlerbericht ist in diesem Kontext nicht verfuegbar.' })
      return
    }
    this.setState({ reportBusy: true, reportStatus: 'Fehlerbericht wird vorbereitet ...' })
    try {
      const saved = await api.saveErrorReport({ error: buildErrorReportRequest(this.state) })
      this.setState({ reportStatus: statusText(saved.data?.canceled, saved.error) })
    } catch {
      this.setState({ reportStatus: 'Fehlerbericht konnte nicht gespeichert werden.' })
    } finally {
      this.setState({ reportBusy: false })
    }
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="error-boundary" role="alert">
        <div className="eb-box">
          <div className="eb-kicker">RaWaLLMConfig</div>
          <div className="eb-title">Diese Ansicht ist abgestuerzt</div>
          <p className="eb-text">
            Die App laeuft weiter. Deine lokalen Konfigurationsdateien wurden dabei nicht veraendert.
          </p>
          {this.state.msg && (
            <details className="eb-detail">
              <summary>Details anzeigen</summary>
              <pre>{this.state.msg}</pre>
            </details>
          )}
          {this.state.reportStatus && <p className="eb-status">{this.state.reportStatus}</p>}
          <div className="eb-actions">
            <button type="button" className="eb-report" onClick={this.saveReport} disabled={this.state.reportBusy}>
              {this.state.reportBusy ? 'Wird vorbereitet ...' : 'Anonymen Fehlerbericht speichern'}
            </button>
            <button type="button" className="eb-reload" onClick={() => location.reload()}>
              Neu laden
            </button>
          </div>
        </div>
      </div>
    )
  }
}

function statusText(canceled: boolean | undefined, error: string | null | undefined): string {
  if (error) return 'Fehlerbericht konnte nicht gespeichert werden.'
  if (canceled) return 'Speichern abgebrochen.'
  return 'Fehlerbericht wurde lokal gespeichert.'
}
