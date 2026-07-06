import { useState } from 'react'
import type { UpdatePhase, UpdateProgressPayload, UpdateStateData } from '@shared/contract-updates'
import { useUpdateManager } from '../../state/store-update-manager'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Icon } from '../../components/Icon'
import { fmtSize } from '../../lib/fmt-size'
import './UpdateManagerPanel.css'
import './UpdatesSection.css'

// UpdateManagerPanel — phasengetriebene Update-UI (Teil-B §4.1).
// Secrets/Pfade werden NIE gerendert — nur generische Fehlertexte.
// Unterkomponenten: IdleCard, AvailableCard, ProgressRow, ReadyCard.

// ─── Leerzustand: RAWALLM_UPDATE_DIR nicht konfiguriert ──────────────────────

function UnconfiguredState() {
  return (
    <div className="ump-empty">
      <span className="ump-empty-ic">{Icon.plug}</span>
      <div className="ump-empty-title">Keine Update-Quelle konfiguriert</div>
      <div className="ump-empty-hint">RAWALLM_UPDATE_DIR oder RAWALLM_RELEASE_URL nicht gesetzt</div>
    </div>
  )
}

// ─── Idle-Card (konfiguriert, kein Update verfügbar) ─────────────────────────

function IdleCard({ state, onCheck, busy }: {
  state: UpdateStateData
  onCheck(): void
  busy: boolean
}) {
  return (
    <div className="ump-idle-card">
      <span className="ump-idle-ic">{Icon.check}</span>
      <div className="ump-idle-body">
        <div className="ump-idle-title">Kein Update verfügbar</div>
        <div className="ump-idle-ver">
          <span className="ump-version-chip mono">{state.currentVersion}</span>
        </div>
      </div>
      <button className="ump-btn" onClick={onCheck} disabled={busy}>
        {Icon.refresh} Prüfen
      </button>
    </div>
  )
}

// ─── Available-Card ───────────────────────────────────────────────────────────

function AvailableCard({ state, onDownload, busy }: {
  state: UpdateStateData
  onDownload(): void
  busy: boolean
}) {
  return (
    <div className="ump-avail-card">
      <div className="ump-avail-head">
        <span className="pill conflict"><span className="pd" />Update verfügbar</span>
        <span className="ump-avail-ver mono">{state.latestVersion}</span>
        <span className="ump-version-chip mono">aktuell: {state.currentVersion}</span>
      </div>
      {state.assetName && (
        <div className="ump-notes mono">{state.assetName}</div>
      )}
      <div>
        <button className="ump-btn primary" onClick={onDownload} disabled={busy}>
          {Icon.up} Herunterladen
        </button>
      </div>
    </div>
  )
}

// ─── Progress-Row ─────────────────────────────────────────────────────────────

function ProgressRow({ progress }: { progress: UpdateProgressPayload | null }) {
  const pct = progress?.percentage ?? 0
  const copied = progress?.copied ?? 0
  const total = progress?.total ?? 0
  return (
    <div className="ump-progress">
      <div className="ump-progress-label">
        <span className="ump-spinner">{Icon.refresh}</span>
        Wird heruntergeladen…
      </div>
      <div className="ump-bar-track">
        <div className="ump-bar-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="ump-progress-bytes">
        {fmtSize(copied)} / {fmtSize(total)} ({Math.round(pct)} %)
      </div>
    </div>
  )
}

// ─── Ready-Card ───────────────────────────────────────────────────────────────

function ReadyCard({ state, onInstall, busy }: {
  state: UpdateStateData
  onInstall(): void
  busy: boolean
}) {
  return (
    <div className="ump-ready-card">
      <span className="pill active"><span className="pd" />bereit</span>
      <div className="ump-ready-body">
        <div className="ump-ready-title">Update bereit zur Installation</div>
        <div className="ump-ready-hint">
          {state.assetName ?? 'Installer bereit'}
        </div>
      </div>
      <button className="ump-btn sage" onClick={onInstall} disabled={busy}>
        {Icon.up} Installieren
      </button>
    </div>
  )
}

// ─── Error-Row ────────────────────────────────────────────────────────────────

function ErrorRow({ msg, onCheck, busy }: { msg: string; onCheck(): void; busy: boolean }) {
  return (
    <div className="ump-error">
      <span className="ump-error-ic">{Icon.warn}</span>
      <div className="ump-error-msg">{msg}</div>
      <button className="ump-btn" onClick={onCheck} disabled={busy}>
        {Icon.refresh} Erneut prüfen
      </button>
    </div>
  )
}

// ─── Phase-Dispatcher ─────────────────────────────────────────────────────────

type DialogKind = 'download' | 'install' | null

function PhaseView({
  state,
  progress,
  busy,
  onCheck,
  onDownload,
  onInstall
}: {
  state: UpdateStateData
  progress: UpdateProgressPayload | null
  busy: boolean
  onCheck(): void
  onDownload(): void
  onInstall(): void
}) {
  const phase: UpdatePhase = state.phase

  if (phase === 'checking') {
    return (
      <div className="ump-checking">
        <span className="ump-spinner">{Icon.refresh}</span>
        Prüfe auf Updates…
      </div>
    )
  }
  if (phase === 'available') {
    return <AvailableCard state={state} onDownload={onDownload} busy={busy} />
  }
  if (phase === 'downloading') {
    return <ProgressRow progress={progress} />
  }
  if (phase === 'ready') {
    return <ReadyCard state={state} onInstall={onInstall} busy={busy} />
  }
  if (phase === 'installing') {
    return (
      <div className="ump-installing">
        <span className="ump-spinner">{Icon.refresh}</span>
        App wird neu gestartet…
      </div>
    )
  }
  if (phase === 'error') {
    // Generischer Fehlertext — kein Pfad/Stack/Secret
    const msg = state.lastError ?? 'Unbekannter Fehler'
    return <ErrorRow msg={msg} onCheck={onCheck} busy={busy} />
  }
  // phase === 'idle'
  return <IdleCard state={state} onCheck={onCheck} busy={busy} />
}

// ─── Haupt-Panel ──────────────────────────────────────────────────────────────

export function UpdateManagerPanel() {
  const { state, busy, progress, check, download, install } = useUpdateManager()
  const [dialog, setDialog] = useState<DialogKind>(null)

  if (!state) {
    return (
      <main className="main" style={{ gridColumn: '1 / -1' }}>
        <div className="ump-wrap">
          <div className="ump-checking">
            <span className="ump-spinner">{Icon.refresh}</span>
            Lade Status…
          </div>
        </div>
      </main>
    )
  }

  if (!state.sourceConfigured) {
    return (
      <main className="main" style={{ gridColumn: '1 / -1' }}>
        <div className="ump-wrap"><UnconfiguredState /></div>
      </main>
    )
  }

  // ConfirmDialog-Handler
  const handleDownloadConfirm = async () => {
    setDialog(null)
    await download()
  }
  const handleInstallConfirm = async () => {
    setDialog(null)
    await install()
  }

  return (
    <main className="main" style={{ gridColumn: '1 / -1' }}>
      <div className="view-head">
        <div className="view-title">
          <h2>Update-Manager</h2>
          <p>Lokale Update-Quelle · Version <span className="mono">{state.currentVersion}</span></p>
        </div>
      </div>

      <div className="ump-wrap">
        <PhaseView
          state={state}
          progress={progress}
          busy={busy}
          onCheck={() => { void check() }}
          onDownload={() => setDialog('download')}
          onInstall={() => setDialog('install')}
        />
      </div>

      <ConfirmDialog
        open={dialog === 'download'}
        title="Update herunterladen?"
        detail={`Version ${state.latestVersion ?? ''} wird in den lokalen Temp-Ordner kopiert. Vor dem Kopieren wird ein Pre-Snapshot angelegt.`}
        confirmLabel="Herunterladen"
        busy={busy}
        onConfirm={() => { void handleDownloadConfirm() }}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'install'}
        title="Update installieren und App neu starten?"
        detail="Der vorbereitete Installer wird gestartet. Die App beendet sich danach automatisch."
        confirmLabel="Installieren"
        busy={busy}
        onConfirm={() => { void handleInstallConfirm() }}
        onCancel={() => setDialog(null)}
      />
    </main>
  )
}
