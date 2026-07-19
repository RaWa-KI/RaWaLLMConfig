// EnvMigrateButton.tsx — sichere, plattformbewusste Env-Anlege-Funktion.
// Der Renderer sendet nur Pfad und Variablennamen; der Wert bleibt im Main.
import { useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useStore } from '../../state/store'
import { msg } from '../../lib/messages'
import type { CredentialMeta, EnvMigrateResultData } from '@shared/contract-write'
import type { IpcResult, System } from '@shared/contract'

interface EnvMigrateButtonProps {
  filePath: string
  cred: CredentialMeta
}

type MigrateStatus = 'idle' | 'busy' | 'done' | 'partial' | 'error'
type EnvPlatform = 'windows' | 'linux' | 'unsupported'

function browserPlatform(): EnvPlatform {
  if (typeof navigator === 'undefined') return 'windows'
  const value = navigator.platform.toLowerCase()
  if (value.includes('linux')) return 'linux'
  if (value.includes('mac')) return 'unsupported'
  return 'windows'
}

export function envPlatformFromSystem(system: System | null): EnvPlatform {
  const cpu = system?.areas.find((area) => area.id === 'hardware')
    ?.entries.find((entry) => entry.id === 'cpu')
  const token = cpu?.desc.trim().split(/\s+/, 1)[0]?.toLowerCase()
  if (token === 'linux') return 'linux'
  if (token === 'darwin') return 'unsupported'
  if (token?.startsWith('win')) return 'windows'
  return browserPlatform()
}

function targetText(platform: Exclude<EnvPlatform, 'unsupported'>): string {
  return platform === 'linux'
    ? msg('envMigrate.target.linux')
    : msg('envMigrate.target.windows')
}

function confirmDetail(platform: Exclude<EnvPlatform, 'unsupported'>, varName: string): string {
  const params = { varRef: `\${${varName}}` }
  return platform === 'linux'
    ? msg('envMigrate.confirm.detail.linux', params)
    : msg('envMigrate.confirm.detail.windows', params)
}

function migrationError(error: string | null): string {
  if (error?.startsWith('backup-')) return msg('envMigrate.error.backup')
  if (error === 'config-rewrite-failed-env-rolled-back') return msg('envMigrate.error.rollback')
  if (error === 'config-rewrite-failed-env-partial') return msg('envMigrate.error.partial')
  if (error === 'env-platform-unsupported') return msg('envMigrate.error.unsupported')
  return msg('envMigrate.error.generic')
}

function useEnvMigration(filePath: string, varName: string) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState<MigrateStatus>('idle')
  const [detail, setDetail] = useState<string | null>(null)

  async function onConfirm() {
    setConfirmOpen(false)
    setStatus('busy')
    setDetail(null)
    try {
      const result: IpcResult<EnvMigrateResultData> = await window.electronAPI!
        .envCreate({ path: filePath, varName })
      if (result.error || !result.data) {
        setStatus('error')
        setDetail(migrationError(result.error))
        return
      }
      if (result.data.varSet && result.data.rewritten) {
        setStatus('done')
        setDetail(msg('envMigrate.status.done', { varName }))
      } else if (result.data.varSet) {
        setStatus('partial')
        setDetail(msg('envMigrate.status.partial', { varName }))
      } else {
        setStatus('error')
        setDetail(msg('envMigrate.error.generic'))
      }
    } catch {
      setStatus('error')
      setDetail(msg('envMigrate.error.generic'))
    }
  }

  return { confirmOpen, setConfirmOpen, status, detail, onConfirm }
}

function MigrationStatus(props: { status: MigrateStatus; detail: string | null }) {
  if (props.status === 'busy') {
    return <span className="emb-status emb-busy">{msg('envMigrate.status.busy')}</span>
  }
  if (props.status === 'done') {
    return <span className="emb-status emb-ok">✓ {props.detail}</span>
  }
  if (props.status === 'partial') {
    return <span className="emb-status emb-warn">⚠ {props.detail}</span>
  }
  if (props.status === 'error') {
    return (
      <span className="emb-status emb-err">
        ✕ {msg('envMigrate.status.error', { detail: props.detail ?? msg('envMigrate.error.generic') })}
      </span>
    )
  }
  return null
}

function EnvMigrateAction(props: {
  filePath: string
  varName: string
  platform: Exclude<EnvPlatform, 'unsupported'>
}) {
  const state = useEnvMigration(props.filePath, props.varName)
  const target = targetText(props.platform)
  return (
    <span className="emb-wrap">
      {state.status === 'idle' && (
        <button
          className="emb-btn"
          title={msg('envMigrate.action.title', { target, varName: props.varName })}
          onClick={() => state.setConfirmOpen(true)}
        >
          {msg('envMigrate.action', { varName: props.varName })}
        </button>
      )}
      <MigrationStatus status={state.status} detail={state.detail} />
      <ConfirmDialog
        open={state.confirmOpen}
        title={msg('envMigrate.confirm.title', { target, varName: props.varName })}
        detail={confirmDetail(props.platform, props.varName)}
        targetPath={props.filePath}
        confirmLabel={msg('envMigrate.confirm.button')}
        busy={state.status === 'busy'}
        onConfirm={() => void state.onConfirm()}
        onCancel={() => state.setConfirmOpen(false)}
      />
    </span>
  )
}

export function EnvMigrateButton({ filePath, cred }: EnvMigrateButtonProps) {
  const { system } = useStore()
  if (!cred.hasSecret || !cred.varSuggestion || cred.alreadyVarRef) return null
  const platform = envPlatformFromSystem(system.data)
  if (platform === 'unsupported') {
    return <span className="emb-status emb-warn">{msg('envMigrate.unavailable.macos')}</span>
  }
  return <EnvMigrateAction filePath={filePath} varName={cred.varSuggestion} platform={platform} />
}
