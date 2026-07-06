// frontmatter-schema.ts — zentrale, additive Warnlogik fuer Frontmatter-Keys.
// Quelle: Owner-gepruefte Anbieter-Doku vom 2026-07-06; keine Werteausgabe.
export type FrontmatterArtifact =
  | 'claude-rule'
  | 'claude-skill'
  | 'claude-agent'
  | 'codex-skill'
  | 'codex-agent'
  | 'generic'

export type FrontmatterDiagnosticLevel = 'hint' | 'warning'

export interface FrontmatterKeyDiagnostic {
  level: FrontmatterDiagnosticLevel
  key: string
  message: string
  suggestion?: string
  docUrl?: string
  verifiedDate: string | null
}

interface FrontmatterSchema {
  official: readonly string[]
  wrongKnown?: Record<string, { suggestion: string; message: string }>
  docUrl: string
  verifiedDate: string | null
}

const CLAUDE_MEMORY_DOC = 'https://code.claude.com/docs/en/memory'
const CLAUDE_SKILLS_DOC = 'https://code.claude.com/docs/en/skills'
const CLAUDE_AGENTS_DOC = 'https://code.claude.com/docs/en/sub-agents'
const CODEX_SKILLS_DOC = 'https://developers.openai.com/codex/skills'

export const FRONTMATTER_SCHEMAS: Record<FrontmatterArtifact, FrontmatterSchema> = {
  'claude-rule': {
    official: ['description', 'paths'],
    wrongKnown: { globs: { suggestion: 'paths', message: 'globs wird von Claude Rules ignoriert.' } },
    docUrl: CLAUDE_MEMORY_DOC,
    verifiedDate: '2026-07-06',
  },
  'claude-skill': {
    official: ['name', 'description', 'paths', 'shell'],
    docUrl: CLAUDE_SKILLS_DOC,
    verifiedDate: '2026-07-06',
  },
  'claude-agent': {
    official: ['name', 'description', 'model', 'tools', 'allowed-tools', 'disallowed-tools', 'disable-model-invocation'],
    docUrl: CLAUDE_AGENTS_DOC,
    verifiedDate: '2026-07-06',
  },
  'codex-skill': {
    official: ['name', 'description'],
    docUrl: CODEX_SKILLS_DOC,
    verifiedDate: '2026-07-06',
  },
  'codex-agent': {
    official: ['name', 'description', 'model', 'tools'],
    docUrl: CODEX_SKILLS_DOC,
    verifiedDate: null,
  },
  generic: {
    official: ['name', 'description', 'paths', 'shell', 'model', 'tools', 'allowed-tools', 'disallowed-tools', 'disable-model-invocation'],
    wrongKnown: { globs: { suggestion: 'paths', message: 'globs ist nur fuer alte/andere Loader bekannt.' } },
    docUrl: '',
    verifiedDate: '2026-07-06',
  },
}

export function inferFrontmatterArtifact(filePath: string): FrontmatterArtifact {
  const lower = filePath.replace(/\\/g, '/').toLowerCase()
  const base = lower.slice(lower.lastIndexOf('/') + 1)
  if (lower.includes('/rules/')) return 'claude-rule'
  if (base === 'skill.md' || lower.includes('/skills/')) {
    return lower.includes('/.claude/') ? 'claude-skill' : 'codex-skill'
  }
  if (lower.includes('/agents/')) {
    return lower.includes('/.claude/') ? 'claude-agent' : 'codex-agent'
  }
  return 'generic'
}

export function validateFrontmatterKeys(
  kind: FrontmatterArtifact,
  keys: readonly string[],
): FrontmatterKeyDiagnostic[] {
  const schema = FRONTMATTER_SCHEMAS[kind]
  const official = new Set(schema.official.map((k) => k.toLowerCase()))
  const diagnostics: FrontmatterKeyDiagnostic[] = []
  for (const key of keys) {
    const lower = key.toLowerCase()
    const wrong = schema.wrongKnown?.[lower]
    if (wrong) {
      diagnostics.push({
        level: 'warning',
        key,
        message: wrong.message,
        suggestion: wrong.suggestion,
        docUrl: schema.docUrl || undefined,
        verifiedDate: schema.verifiedDate,
      })
    } else if (!official.has(lower)) {
      diagnostics.push({
        level: 'hint',
        key,
        message: 'Key ist fuer diesen Frontmatter-Typ nicht offiziell dokumentiert.',
        docUrl: schema.docUrl || undefined,
        verifiedDate: schema.verifiedDate,
      })
    }
  }
  if (keys.length >= 12) {
    diagnostics.push({
      level: 'hint',
      key: 'frontmatter',
      message: 'Weitere Schluessel wurden nicht geprueft, weil der Scanner bei 12 Keys kappt.',
      verifiedDate: schema.verifiedDate,
    })
  }
  return diagnostics
}
