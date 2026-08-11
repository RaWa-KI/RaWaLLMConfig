import { readFileSync } from 'node:fs'
import { appendAudit, makeAuditEntry } from '../../src/main/services/audit-log'
import { isSecretPathForRead } from '../../src/main/services/secret-guard'
import { maskSecrets } from '../../src/main/services/secret-mask'
import { setWriteEnabledRuntime } from '../../src/main/services/write-mode'
import { makeSandbox } from './fixtures'

export function withWriteMode(on: boolean | null, fn: () => void): void {
  setWriteEnabledRuntime(on)
  try {
    fn()
  } finally {
    setWriteEnabledRuntime(null)
  }
}

export const SECRET_VALUE_PATHS = [
  '/home/u/.claude/settings.json',
  '/home/u/.claude/settings.local.json',
  '/home/u/.claude/settings.prod.json',
  '/home/u/.claude.json',
  '/home/u/.claude/.credentials.json',
  '/home/u/.codex/auth.json',
  '/home/u/.codex/config.toml',
  '/home/u/.codex/state.sqlite',
  '/home/u/.codex/state.sqlite3',
  '/home/u/.codex/installation_id',
  '/home/u/.codex/.sandbox-secrets',
  '/home/u/.codex/codex-global-state',
  '/home/u/.codex/codex-global-state.json',
  '/home/u/x/token.secret',
  '/home/u/.shared/x/credentials/key-list.md',
  '/home/u/.shared/x/security/policy.md',
  '/home/u/x/api.env',
  '/home/u/x/private.key',
  '/home/u/x/cert.pem',
  '/home/u/x/.env'
]

export const READ_VISIBLE_PATHS = [
  '/home/u/.claude/password-policy.txt',
  '/home/u/x/secrets-backup.json'
]

export const DOC_EDITABLE_PATHS = [
  '/home/u/.shared/.claude/rules/credentials-protection.md',
  '/home/u/.shared/.claude/plugins/rkwc-php-stack/agents/security-agent.md',
  '/home/u/.shared/.claude/references/block-credential-leak.md',
  '/home/u/.shared/.claude/references/block-credential-mutation.md',
  '/home/u/.shared/.claude/skills/token-effizienz/token-effizienz.md',
  '/home/u/.claude/my-token-notes.md',
  '/home/u/.claude/auth-flow.md'
]

export const SAFE_PATHS = [
  '/home/u/.claude/CLAUDE.md',
  '/home/u/.claude/rules/harte-regeln.md',
  '/home/u/.claude/agents/humangenetiker.md',
  '/home/u/.claude/agents/AGENTS.md',
  '/home/u/.shared/.claude/skills/token-effizienz/SKILL.md',
  '/home/u/notes/settings-overview.md'
]

function hasNakedCredential(content: string): boolean {
  const assignRx =
    /(?:password|passwd|token|secret|api[_-]?key|auth[_-]?key)\s*[=:]\s*(?!["']?\$\{)[^\s$#\r\n]{6,}/gi
  return assignRx.test(content)
}

export function readFullBehavior(
  path: string,
  raw: string,
  reveal: boolean,
  auditPath: string
): { content: string; masked: boolean; maskedCount: number } {
  const isSecret = isSecretPathForRead(path)
  if (isSecret && reveal) {
    appendAudit(makeAuditEntry('readfull-reveal', path, 'ok'), auditPath)
    return { content: raw, masked: false, maskedCount: 0 }
  }
  if (isSecret) {
    const { masked, maskedCount } = maskSecrets(raw, path)
    return { content: masked, masked: true, maskedCount }
  }
  if (hasNakedCredential(raw)) {
    const { masked, maskedCount } = maskSecrets(raw, path)
    return { content: masked, masked: true, maskedCount }
  }
  return { content: raw, masked: false, maskedCount: 0 }
}

export function applyOpts(sb: ReturnType<typeof makeSandbox>) {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
}

export function readAudit(path: string): string {
  return readFileSync(path, 'utf8')
}
