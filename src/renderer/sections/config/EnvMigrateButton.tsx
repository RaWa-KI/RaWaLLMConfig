// EnvMigrateButton.tsx — Env-Anlege-Funktion (Cluster G, Tier 1, sicherheitskritisch).
// Erscheint NUR wenn CredentialMeta.varSuggestion gesetzt ist (nackter Secret-Wert).
// Ruft Bridge envCreate({path, varName}) — KEIN value-Feld (Main liest Wert selbst).
// Status-Anzeige: gesetzt / umgestellt / Fehler — NIEMALS der echte Secret-Wert.
// Einhängung im Drawer erfolgt durch WP-D; diese Datei nur exportieren.
import { useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { CredentialMeta, EnvMigrateResultData } from '@shared/contract-write'
import type { IpcResult } from '@shared/contract'

interface EnvMigrateButtonProps {
  /** Absoluter Pfad der Config-Datei (nur Name, nie Inhalt). */
  filePath: string
  /** Credential-Metadaten aus ReadFullResultData.credential. */
  cred: CredentialMeta
}

type MigrateStatus = 'idle' | 'busy' | 'done' | 'partial' | 'error'

const CONFIRM_DETAIL =
  'Die User-Env-Variable wird angelegt und die Config-Zeile auf ${VAR} umgestellt. ' +
  'Ein Pre-Snapshot wird zuerst erstellt (backup-first). ' +
  'Der Wert wird nur im Main-Prozess verarbeitet — nie im Chat oder Log sichtbar.'

// Komponente ist nur sichtbar wenn ein varSuggestion vorliegt und Wert noch nicht Var-Ref.
export function EnvMigrateButton({ filePath, cred }: EnvMigrateButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState<MigrateStatus>('idle')
  const [detail, setDetail] = useState<string | null>(null)

  // Bedingung: nur rendern wenn nackter Secret vorhanden und VAR-Vorschlag existiert.
  if (!cred.hasSecret || !cred.varSuggestion || cred.alreadyVarRef) return null

  const varName = cred.varSuggestion

  async function onConfirm() {
    setConfirmOpen(false)
    setStatus('busy')
    setDetail(null)
    try {
      const res: IpcResult<EnvMigrateResultData> = await window.electronAPI!.envCreate({ path: filePath, varName })
      if (res.error || !res.data) {
        setStatus('error')
        setDetail(res.error ?? 'Unbekannter Fehler')
        return
      }
      const { varSet, rewritten } = res.data
      if (varSet && rewritten) {
        setStatus('done')
        setDetail(`${varName} gesetzt + Config umgestellt.`)
      } else if (varSet) {
        setStatus('partial')
        setDetail(`${varName} gesetzt. Config-Rewrite nicht abgeschlossen.`)
      } else {
        setStatus('error')
        setDetail('Env-Variable konnte nicht gesetzt werden.')
      }
    } catch {
      setStatus('error')
      setDetail('Unerwarteter Fehler beim Env-Migrate.')
    }
  }

  const busy = status === 'busy'

  return (
    <span className="emb-wrap">
      {status === 'idle' && (
        <button
          className="emb-btn"
          title={`User-Env anlegen: ${varName}`}
          onClick={() => setConfirmOpen(true)}
        >
          Env anlegen ({varName})
        </button>
      )}

      {status === 'busy' && (
        <span className="emb-status emb-busy">Anlegen …</span>
      )}

      {status === 'done' && (
        <span className="emb-status emb-ok" title={detail ?? undefined}>
          ✓ {varName} gesetzt
        </span>
      )}

      {status === 'partial' && (
        <span className="emb-status emb-warn" title={detail ?? undefined}>
          ⚠ {varName} gesetzt (Config manuell prüfen)
        </span>
      )}

      {status === 'error' && (
        <span className="emb-status emb-err" title={detail ?? undefined}>
          ✕ Fehler: {detail}
        </span>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`User-Env anlegen: ${varName}?`}
        detail={CONFIRM_DETAIL}
        targetPath={filePath}
        confirmLabel="Anlegen"
        busy={busy}
        onConfirm={() => void onConfirm()}
        onCancel={() => setConfirmOpen(false)}
      />
    </span>
  )
}
