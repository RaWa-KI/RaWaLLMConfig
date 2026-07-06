// Semantischer Vergleich fuer Shared-Agent-Markdown vs. Codex-Agent-TOML.
// Rohdateien sind absichtlich unterschiedlich; fuer die Coverage zaehlt, ob
// der Codex-Adapter die Agent-Metadaten und Instruktionen der Shared-Quelle traegt.
import fs from 'node:fs'
import path from 'node:path'

interface MarkdownAgent {
  fm: Record<string, string>
  body: string
}

interface CodexAgent {
  name: string
  description: string
  effort: string
  instructions: string
}

function isMarkdownTomlPair(a: string, b: string): boolean {
  return /\.md$/i.test(a) && /\.toml$/i.test(b)
}

function looksLikeAgentPair(mdPath: string, tomlPath: string): boolean {
  const md = mdPath.toLowerCase()
  const toml = tomlPath.toLowerCase()
  return (
    toml.includes(`${path.sep}.codex${path.sep}agents${path.sep}`) &&
    (
      md.includes(`${path.sep}.shared${path.sep}.claude${path.sep}agents${path.sep}`) ||
      md.includes(`${path.sep}.shared${path.sep}.claude${path.sep}plugins${path.sep}`)
    )
  )
}

function parseMarkdownAgent(text: string): MarkdownAgent {
  const normalized = text.replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  if (!m) return { fm: {}, body: normalized }
  const fm: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    fm[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return { fm, body: normalized.slice(m[0].length) }
}

function tomlString(text: string, key: string): string {
  const m = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(text)
  return m?.[1] ?? ''
}

function parseCodexAgent(text: string): CodexAgent {
  const normalized = text.replace(/\r\n/g, '\n')
  const instructions = /developer_instructions\s*=\s*'''\n([\s\S]*?)\n'''/m.exec(normalized)?.[1] ?? ''
  return {
    name: tomlString(normalized, 'name'),
    description: tomlString(normalized, 'description'),
    effort: tomlString(normalized, 'model_reasoning_effort'),
    instructions,
  }
}

function normalizedLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim()
}

function importantLines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('```'))
}

function effortMatches(markdownEffort: string | undefined, codexEffort: string): boolean {
  if (!markdownEffort) return true
  if (markdownEffort === codexEffort) return true
  return markdownEffort === 'max' && codexEffort === 'xhigh'
}

function metadataMatches(markdown: MarkdownAgent, codex: CodexAgent): boolean {
  if (markdown.fm.name && markdown.fm.name !== codex.name) return false
  if (markdown.fm.description && markdown.fm.description !== codex.description) return false
  return effortMatches(markdown.fm.effort, codex.effort)
}

function bodyIsCarried(markdown: MarkdownAgent, codex: CodexAgent): boolean {
  if (!codex.instructions) return false
  const carried = normalizedLine(codex.instructions)
  for (const line of importantLines(markdown.body)) {
    if (!carried.includes(normalizedLine(line))) return false
  }
  return true
}

export function isSemanticallySameAgentAdapter(refPath: string, otherPath: string): boolean {
  const [mdPath, tomlPath] = isMarkdownTomlPair(refPath, otherPath)
    ? [refPath, otherPath]
    : isMarkdownTomlPair(otherPath, refPath)
      ? [otherPath, refPath]
      : []
  if (!mdPath || !tomlPath || !looksLikeAgentPair(mdPath, tomlPath)) return false
  try {
    const markdown = parseMarkdownAgent(fs.readFileSync(mdPath, 'utf8'))
    const codex = parseCodexAgent(fs.readFileSync(tomlPath, 'utf8'))
    return metadataMatches(markdown, codex) && bodyIsCarried(markdown, codex)
  } catch {
    return false
  }
}
