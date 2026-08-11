// claude-doctor-mcp-context.ts — sanitisierte MCP-Identitaet fuer den Doctor.
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { DoctorMcpService, DoctorSourceRef } from './claude-doctor-context'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function safeEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}` } catch { return undefined }
}

function endpointPort(url: unknown, args: string[]): number | undefined {
  if (typeof url === 'string') try { const parsed = Number(new URL(url).port); if (parsed > 0) return parsed } catch { /* invalid URL */ }
  for (let index = 0; index < args.length; index += 1) {
    const match = /^--port=(\d+)$/.exec(args[index])
    const parsed = Number(match?.[1] ?? (args[index] === '--port' ? args[index + 1] : ''))
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) return parsed
  }
  return undefined
}

function stdioCore(command: string, args: string[]): string {
  const bin = path.basename(command).toLowerCase().replace(/\.exe$/, '')
  const positional = args.find((item) => !item.startsWith('-') && !['exec', 'dlx', 'x'].includes(item)) ?? ''
  if (['npm', 'npx', 'pnpm', 'yarn', 'bun', 'bunx'].includes(bin) && positional) {
    const packageName = positional.replace(/^(@[^/]+\/[^@]+)@.+$/, '$1').replace(/^([^@]+)@.+$/, '$1')
    return `package:${packageName.toLowerCase()}`
  }
  return `command:${bin}:${positional.replace(/\\/g, '/').toLowerCase()}`
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function collectMcpServices(
  value: unknown,
  scope: DoctorMcpService['scope'],
  source: DoctorSourceRef,
  projectKey?: string,
): DoctorMcpService[] {
  const root = isRecord(value) && isRecord(value.mcpServers) ? value.mcpServers : value
  if (!isRecord(root)) return []
  return Object.entries(root).flatMap(([name, raw]) => {
    if (!isRecord(raw)) return []
    const url = safeEndpoint(raw.url)
    const command = typeof raw.command === 'string' ? raw.command : ''
    const args = Array.isArray(raw.args) ? raw.args.filter((item): item is string => typeof item === 'string') : []
    const transport = typeof raw.type === 'string' ? raw.type : url ? 'http' : command ? 'stdio' : 'unknown'
    const core = url ? `endpoint:${url}` : command ? `stdio:${stdioCore(command, args)}` : ''
    const port = endpointPort(raw.url, args)
    const tools = Array.isArray(raw.tools) ? raw.tools.filter((item): item is string => typeof item === 'string').slice(0, 128) : []
    return [{ name, scope, source, ...(projectKey ? { projectKey } : {}), transport,
      ...(core ? { coreFingerprint: fingerprint(core) } : {}), ...(port ? { endpointPort: port } : {}), tools }]
  })
}

function normalizedProjectKey(value: string): string {
  return value.normalize('NFKC').replace(/\\/g, '/').toLowerCase()
}

export function collectLocalMcpServices(
  state: unknown,
  projectRoot: string | null,
  source: DoctorSourceRef,
): DoctorMcpService[] {
  if (!isRecord(state)) return []
  const out = collectMcpServices(state.mcpServers, 'user', source)
  if (!isRecord(state.projects) || !projectRoot) return out
  for (const [key, project] of Object.entries(state.projects)) {
    if (normalizedProjectKey(key) === normalizedProjectKey(projectRoot) && isRecord(project)) {
      out.push(...collectMcpServices(project.mcpServers, 'local', source, key))
    }
  }
  return out
}
