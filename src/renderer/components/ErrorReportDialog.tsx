import { useCallback, useEffect, useState } from 'react'
import type { ErrorReportSystemInfo } from '@shared/contract-error-report'
import { getRecentErrorLogsJson } from '../lib/error-log-buffer'

// Online-Fehlerbericht-Dialog (D055, Stufe 2): sammelt Systeminfo + Screenshot
// ueber die Preload-Bridge, zeigt eine Vorschau und sendet erst nach aktivem
// Klick auf "Fehler melden". Opt-out pro Datentyp (Screenshot/Logs).
// Phasen: collecting -> preview -> sending -> success/error.
interface ErrorReportDialogProps {
  errorMessage?: string
  errorStack?: string
  errorSource?: string
  onClose: () => void
}

type DialogPhase = 'collecting' | 'preview' | 'sending' | 'success' | 'error'

export function ErrorReportDialog({ errorMessage, errorStack, errorSource, onClose }: ErrorReportDialogProps) {
  const [phase, setPhase] = useState<DialogPhase>('collecting')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [systemInfo, setSystemInfo] = useState<ErrorReportSystemInfo | null>(null)
  const [rateLimit, setRateLimit] = useState<{ remaining: number; limit: number } | null>(null)
  const [userComment, setUserComment] = useState('')
  const [includeScreenshot, setIncludeScreenshot] = useState(true)
  const [includeLogs, setIncludeLogs] = useState(true)
  const [resultMessage, setResultMessage] = useState('')

  // Daten sammeln beim Oeffnen (Screenshot bleibt zusätzlich im Main als
  // pendingScreenshot — der Renderer schickt ihn nicht zurueck uebers IPC).
  useEffect(() => {
    const collect = async () => {
      try {
        const api = window.electronAPI?.errorReport
        if (!api) {
          setPhase('error')
          setResultMessage('Fehlerbericht ist in diesem Kontext nicht verfuegbar')
          return
        }
        const res = await api.collect({
          message: errorMessage || '',
          stack: errorStack,
          source: errorSource || 'manual'
        })
        if (res.error || !res.data) {
          setPhase('error')
          setResultMessage(res.error || 'Daten konnten nicht gesammelt werden')
          return
        }
        setSystemInfo(res.data.systemInfo)
        setScreenshot(res.data.screenshot)
        setRateLimit(res.data.rateLimit)
        setPhase('preview')
      } catch {
        setPhase('error')
        setResultMessage('Daten konnten nicht gesammelt werden')
      }
    }
    void collect()
  }, [errorMessage, errorStack, errorSource])

  const handleSubmit = useCallback(async () => {
    setPhase('sending')
    try {
      const api = window.electronAPI?.errorReport
      if (!api) {
        setPhase('error')
        setResultMessage('Fehlerbericht ist in diesem Kontext nicht verfuegbar')
        return
      }
      const res = await api.submit({
        errorMessage: errorMessage || 'Unbekannter Fehler',
        errorStack,
        errorSource: errorSource || 'manual',
        userComment: userComment.trim() || undefined,
        includeScreenshot,
        includeLogs,
        logs: includeLogs ? getRecentErrorLogsJson() : undefined
      })
      if (!res.error && res.data?.success) {
        setPhase('success')
        setResultMessage(res.data.reportId
          ? `Fehlerbericht gesendet (ID: ${res.data.reportId})`
          : 'Fehlerbericht erfolgreich gesendet')
      } else {
        setPhase('error')
        setResultMessage(res.data?.error || res.error || 'Unbekannter Fehler beim Senden')
      }
    } catch (err) {
      setPhase('error')
      setResultMessage(err instanceof Error ? err.message : 'Senden fehlgeschlagen')
    }
  }, [errorMessage, errorStack, errorSource, userComment, includeScreenshot, includeLogs])

  // ESC zum Schliessen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const canSubmit = phase === 'preview' && rateLimit?.remaining !== 0

  return (
    <div className="error-report-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="error-report-dialog" role="dialog" aria-modal="true" aria-label="Fehler melden">
        <div className="error-report-header">
          <h2>Fehler an den Entwickler melden</h2>
          <button type="button" onClick={onClose} className="error-report-close" title="Schliessen (ESC)">&times;</button>
        </div>
        <div className="error-report-body">
          {phase === 'collecting' && (
            <div className="error-report-center">
              <div className="error-report-spinner" />
              <p>Daten werden gesammelt ...</p>
            </div>
          )}
          {phase === 'preview' && (
            <div className="error-report-columns">
              <div className="error-report-form">
                <div className="error-report-error-box">
                  <p className="error-report-error-label">Fehler:</p>
                  <p className="error-report-error-text">{errorMessage}</p>
                </div>
                <label className="error-report-label" htmlFor="error-report-comment">Was ist passiert? (optional)</label>
                <textarea
                  id="error-report-comment"
                  value={userComment}
                  onChange={(e) => setUserComment(e.target.value)}
                  placeholder="Beschreibe kurz, was du gerade gemacht hast ..."
                  className="error-report-textarea"
                />
                <div className="error-report-privacy">
                  <strong>Datenschutz:</strong> Es werden keine persoenlichen Daten, Pfade oder
                  Lizenzschluessel uebertragen. Nur technische Informationen (Version, Betriebssystem)
                  und die von dir freigegebenen Anhaenge.
                </div>
              </div>
              <div className="error-report-sidebar">
                {screenshot && (
                  <div className="error-report-attachment">
                    <label className="error-report-checkbox-label">
                      <input type="checkbox" checked={includeScreenshot} onChange={(e) => setIncludeScreenshot(e.target.checked)} />
                      Screenshot mitsenden
                    </label>
                    {includeScreenshot && (
                      <div className="error-report-screenshot">
                        <img src={`data:image/png;base64,${screenshot}`} alt="Screenshot der App" />
                      </div>
                    )}
                  </div>
                )}
                <div className="error-report-attachment">
                  <label className="error-report-checkbox-label">
                    <input type="checkbox" checked={includeLogs} onChange={(e) => setIncludeLogs(e.target.checked)} />
                    Debug-Logs mitsenden
                  </label>
                  <p className="error-report-hint">Letzte Fehler-Meldungen dieser Sitzung</p>
                </div>
                {systemInfo && (
                  <div className="error-report-system">
                    <details>
                      <summary>Systeminfo (immer gesendet)</summary>
                      <div className="error-report-system-info">
                        <div>Version: {systemInfo.appVersion}</div>
                        <div>Electron: {systemInfo.electronVersion}</div>
                        <div>OS: {systemInfo.platform} {systemInfo.arch}</div>
                        <div>RAM: {systemInfo.freeMemoryMB} / {systemInfo.totalMemoryMB} MB</div>
                      </div>
                    </details>
                  </div>
                )}
                {rateLimit && rateLimit.remaining === 0 && (
                  <div className="error-report-rate-limit">
                    Tageslimit erreicht ({rateLimit.limit} Berichte/Tag). Bitte morgen erneut versuchen.
                  </div>
                )}
              </div>
            </div>
          )}
          {phase === 'sending' && (
            <div className="error-report-center">
              <div className="error-report-spinner" />
              <p>Fehlerbericht wird gesendet ...</p>
            </div>
          )}
          {phase === 'success' && (
            <div className="error-report-center">
              <div className="error-report-success-icon">&#10004;</div>
              <p className="error-report-success-text">{resultMessage}</p>
              <p>Vielen Dank fuer deine Mithilfe!</p>
            </div>
          )}
          {phase === 'error' && (
            <div className="error-report-center">
              <div className="error-report-error-icon">&#10060;</div>
              <p className="error-report-error-text">{resultMessage}</p>
              <p>Der Fehlerbericht konnte nicht gesendet werden.</p>
            </div>
          )}
        </div>
        <div className="error-report-footer">
          {phase === 'preview' && (
            <>
              <button type="button" onClick={onClose} className="error-report-btn secondary">Abbrechen</button>
              <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit} className="error-report-btn primary">Fehler melden</button>
            </>
          )}
          {(phase === 'success' || phase === 'error') && (
            <button type="button" onClick={onClose} className="error-report-btn primary">Schliessen</button>
          )}
        </div>
      </div>
    </div>
  )
}
