import type { GraphNode, IgnoreScopeState } from '@shared/contract-graph'

export type IgnoreAppendResult =
  | { ok: true; added: number; snapshot: string }
  | { ok: false; error: string }

function splitRules(content: string): string[] {
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function mergeRules(state: IgnoreScopeState, rules: string[]): { content: string; added: number } {
  const existing = splitRules(state.content)
  const seen = new Set(existing)
  const add = rules.map((r) => r.trim()).filter((r) => r && !seen.has(r))
  for (const rule of add) seen.add(rule)
  const content = [...existing, ...add].join('\n')
  return { content: content ? content + '\n' : '', added: add.length }
}

export async function appendGraphignoreRules(
  wsRoot: string,
  rules: string[]
): Promise<IgnoreAppendResult> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api?.graphReadIgnores || !api.graphWriteIgnore) {
    return { ok: false, error: 'Bridge nicht verfügbar' }
  }
  const read = await api.graphReadIgnores(wsRoot)
  if (read.error || !read.data) {
    return { ok: false, error: read.error ?? 'Ignore-Regeln konnten nicht gelesen werden' }
  }
  const next = mergeRules(read.data.graphify, rules)
  if (next.added === 0) return { ok: true, added: 0, snapshot: '' }
  const written = await api.graphWriteIgnore({ wsRoot, scope: 'graphify', content: next.content })
  if (written.error || !written.data) {
    return { ok: false, error: written.error ?? 'Ignore-Regel konnte nicht geschrieben werden' }
  }
  return { ok: true, added: next.added, snapshot: written.data.snapshotPath }
}

function nodeSignature(nodes: GraphNode[]): string {
  return nodes.map((n) => n.id).sort().join('\n')
}

async function resolveWsRoot(nodes: GraphNode[]): Promise<string | null | 'ambiguous'> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api?.graphIngest) return null
  const res = await api.graphIngest()
  if (res.error || !res.data) return null
  const current = nodeSignature(nodes)
  const matches = res.data.workspaces.filter((ws) => nodeSignature(ws.nodes) === current)
  if (matches.length > 1) return 'ambiguous'
  return matches[0]?.ws ?? null
}

export async function appendGraphignoreRulesForNodes(
  nodes: GraphNode[],
  rules: string[]
): Promise<IgnoreAppendResult> {
  const wsRoot = await resolveWsRoot(nodes)
  if (wsRoot === 'ambiguous') return { ok: false, error: 'Workspace nicht eindeutig ableitbar' }
  if (!wsRoot) return { ok: false, error: 'Workspace konnte nicht abgeleitet werden' }
  return appendGraphignoreRules(wsRoot, rules)
}
