// claude-source-audit.ts — reine, wertfreie D4-D6-Pruefregeln.
// Die Dateisystem-/JSON-Aufloesung bleibt im Claude-Doctor-Context.
import path from 'node:path'
import type { DoctorMcpService, DoctorSourceRef } from './claude-doctor-context'

type McpScope = DoctorMcpService['scope']
type ComponentKind = 'agent' | 'skill'
type ComponentScope = 'global' | 'workspace' | 'plugin'
type PathPlatform = 'win32' | 'linux' | 'darwin'

export interface DoctorMcpEvidence extends DoctorMcpService {
  endpointPort?: number; canonicalRegistryId?: string
}

export interface DoctorCanonicalPort {
  id: string; service?: string; port?: number; protocol?: string
}

interface DoctorMcpParticipant {
  name: string
  source: DoctorSourceRef
  scope: McpScope
  disposition: 'keep' | 'disable-candidate' | 'review'
  canonicalRegistryId?: string
}

export interface DoctorMcpOverlapFinding {
  rule: 'D4'
  kind: 'mcp-service-overlap'
  signal: 'service-core' | 'tool-overlap' | 'service-core+tool-overlap'
  toolOverlapCount: number
  left: DoctorMcpParticipant
  right: DoctorMcpParticipant
}

export interface DoctorComponentCandidate {
  kind: ComponentKind; scope: ComponentScope
  filePath: string; sourceBasename: string
  frontmatterName?: string; pluginEnabled?: boolean
}

export interface DoctorComponentDuplicateFinding {
  rule: 'D5'
  kind: 'component-context-duplicate'
  componentKind: ComponentKind
  name: string
  source: ComponentFindingRef
  plugin: ComponentFindingRef
}

interface ComponentFindingRef {
  scope: ComponentScope; filePath: string; sourceBasename: string
}

interface DoctorMarketplaceRuntimeSource {
  marketplace: string; sourceFile: string
  sourceKind: string; location?: string
}

interface DoctorInstalledRuntimeSource {
  pluginId: string; version?: string; registryFile: string
  installPath?: string; installLocation?: string; available?: boolean
}

interface DoctorKnownMarketplaceRecord {
  marketplace: string; registryFile: string
  installLocation?: string; available?: boolean
}

export interface DoctorSharedRuntimeInput {
  sharedRoot: string
  marketplaces: readonly DoctorMarketplaceRuntimeSource[]
  knownMarketplaces: readonly DoctorKnownMarketplaceRecord[]
  installed: readonly DoctorInstalledRuntimeSource[]
  platform?: PathPlatform
}

export interface DoctorSharedRuntimeFinding {
  rule: 'D6'
  kind: 'shared-runtime-source'
  runtimeSource: {
    type: 'marketplace' | 'installed-plugin'
    owner: string
    field: 'directory' | 'installPath' | 'installLocation'
    sourceFile: string
  }
  runtimePath: string
  counterpart: {
    kind: 'marketplace' | 'plugin-install'
    identity: string
    version?: string
    state: 'present' | 'missing'
  }
  disableEligible: boolean
  mutation: 'none'
}

interface RuntimePathCandidate {
  type: DoctorSharedRuntimeFinding['runtimeSource']['type']
  owner: string
  field: DoctorSharedRuntimeFinding['runtimeSource']['field']
  sourceFile: string
  value: string
  recordIndex?: number
  version?: string
}

export function auditMcpSourceOverlaps(
  services: readonly DoctorMcpEvidence[],
  canonicalPorts: readonly DoctorCanonicalPort[],
): DoctorMcpOverlapFinding[] {
  const findings: DoctorMcpOverlapFinding[] = []
  for (let leftIndex = 0; leftIndex < services.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < services.length; rightIndex += 1) {
      const finding = mcpOverlap(services[leftIndex], services[rightIndex], canonicalPorts)
      if (finding) findings.push(finding)
    }
  }
  return findings
}

export function auditComponentDuplicates(
  candidates: readonly DoctorComponentCandidate[],
): DoctorComponentDuplicateFinding[] {
  const plugins = candidates.filter((candidate) => candidate.scope === 'plugin' && candidate.pluginEnabled === true)
  const direct = candidates.filter((candidate) => candidate.scope === 'global' || candidate.scope === 'workspace')
  const findings: DoctorComponentDuplicateFinding[] = []
  for (const source of direct) {
    const sourceName = componentName(source)
    if (!sourceName) continue
    for (const plugin of plugins) {
      if (source.kind !== plugin.kind || sourceName.key !== componentName(plugin)?.key) continue
      findings.push({ rule: 'D5', kind: 'component-context-duplicate', componentKind: source.kind,
        name: sourceName.display, source: componentRef(source), plugin: componentRef(plugin) })
    }
  }
  return findings
}

export function auditSharedRuntimeSources(input: DoctorSharedRuntimeInput): DoctorSharedRuntimeFinding[] {
  const platform = input.platform ?? inferredPlatform(input.sharedRoot)
  const runtimeCandidates = runtimePaths(input)
  return runtimeCandidates.flatMap((candidate) => {
    const resolved = resolveRuntimePath(candidate.value, candidate.sourceFile, platform)
    if (!isPathEqualOrUnder(resolved, input.sharedRoot, platform)) return []
    const counterpart = runtimeCounterpart(candidate, input, platform)
    return [{ rule: 'D6', kind: 'shared-runtime-source', runtimeSource: {
      type: candidate.type, owner: candidate.owner, field: candidate.field, sourceFile: candidate.sourceFile,
    }, runtimePath: resolved, counterpart,
    disableEligible: counterpart.state === 'present',
    mutation: 'none' }]
  })
}

function mcpOverlap(
  left: DoctorMcpEvidence,
  right: DoctorMcpEvidence,
  ports: readonly DoctorCanonicalPort[],
): DoctorMcpOverlapFinding | null {
  if (left.scope === right.scope && left.source.kind === right.source.kind
    && left.source.basename === right.source.basename) return null
  const coreMatch = !!left.coreFingerprint && left.coreFingerprint === right.coreFingerprint
  const overlapCount = toolIntersection(left.tools, right.tools).size
  if (!coreMatch && overlapCount === 0) return null
  const leftRegistry = canonicalRegistry(left, ports)
  const rightRegistry = canonicalRegistry(right, ports)
  return { rule: 'D4', kind: 'mcp-service-overlap',
    signal: coreMatch && overlapCount ? 'service-core+tool-overlap' : coreMatch ? 'service-core' : 'tool-overlap',
    toolOverlapCount: overlapCount,
    left: mcpParticipant(left, leftRegistry, !!rightRegistry),
    right: mcpParticipant(right, rightRegistry, !!leftRegistry) }
}

function mcpParticipant(
  service: DoctorMcpEvidence,
  registryId: string | undefined,
  counterpartIsCanonical: boolean,
): DoctorMcpParticipant {
  return { name: service.name, source: service.source, scope: service.scope,
    disposition: registryId ? 'keep' : counterpartIsCanonical ? 'disable-candidate' : 'review',
    ...(registryId ? { canonicalRegistryId: registryId } : {}) }
}

function canonicalRegistry(service: DoctorMcpEvidence, ports: readonly DoctorCanonicalPort[]): string | undefined {
  if (service.canonicalRegistryId && ports.some((item) => item.id === service.canonicalRegistryId)) {
    return service.canonicalRegistryId
  }
  if (service.scope === 'plugin') return undefined
  const byPort = service.endpointPort === undefined
    ? undefined
    : ports.find((item) => item.port === service.endpointPort)
  return byPort?.id
}

function toolIntersection(left: readonly string[], right: readonly string[]): Set<string> {
  const leftNames = new Set(left.map(normalizedToolName).filter(Boolean))
  return new Set(right.map(normalizedToolName).filter((name) => name && leftNames.has(name)))
}

function normalizedToolName(value: string): string {
  const normalized = normalizedIdentifier(value)
  const namespaced = normalized.split('__').filter(Boolean)
  return normalized.startsWith('mcp__') && namespaced.length >= 3 ? namespaced.at(-1) ?? '' : normalized
}

function normalizedIdentifier(value: string): string {
  return unicodeCaseFold(value.normalize('NFKC').trim())
}

function componentName(candidate: DoctorComponentCandidate): { key: string; display: string } | null {
  const display = candidate.frontmatterName?.normalize('NFKC').trim()
  return display ? { display, key: unicodeCaseFold(display) } : null
}

function unicodeCaseFold(value: string): string {
  return value.toLocaleLowerCase('und').replaceAll('ß', 'ss').replaceAll('ς', 'σ')
}

function componentRef(candidate: DoctorComponentCandidate): ComponentFindingRef {
  return { scope: candidate.scope, filePath: candidate.filePath, sourceBasename: candidate.sourceBasename }
}

function runtimePaths(input: DoctorSharedRuntimeInput): RuntimePathCandidate[] {
  const marketplaces = input.marketplaces.flatMap((source): RuntimePathCandidate[] => {
    if (source.sourceKind.toLowerCase() !== 'directory' || !source.location) return []
    return [{ type: 'marketplace', owner: source.marketplace, field: 'directory',
      sourceFile: source.sourceFile, value: source.location }]
  })
  const installed = input.installed.flatMap((source, recordIndex): RuntimePathCandidate[] => [
    ...(source.installPath ? [{ type: 'installed-plugin' as const, owner: source.pluginId,
      field: 'installPath' as const, sourceFile: source.registryFile, value: source.installPath,
      recordIndex, ...(source.version ? { version: source.version } : {}) }] : []),
    ...(source.installLocation ? [{ type: 'installed-plugin' as const, owner: source.pluginId,
      field: 'installLocation' as const, sourceFile: source.registryFile, value: source.installLocation,
      recordIndex, ...(source.version ? { version: source.version } : {}) }] : []),
  ])
  return [...marketplaces, ...installed]
}

function runtimeCounterpart(
  candidate: RuntimePathCandidate,
  input: DoctorSharedRuntimeInput,
  platform: PathPlatform,
): DoctorSharedRuntimeFinding['counterpart'] {
  if (candidate.type === 'marketplace') {
    const present = input.knownMarketplaces.some((record) =>
      normalizedIdentifier(record.marketplace) === normalizedIdentifier(candidate.owner)
      && record.available === true
      && !!record.installLocation
      && isOutsideShared(record.installLocation, record.registryFile, input.sharedRoot, platform))
    return { kind: 'marketplace', identity: candidate.owner, state: present ? 'present' : 'missing' }
  }
  const present = candidate.version !== undefined && input.installed.some((record, index) =>
    index !== candidate.recordIndex
    && normalizedIdentifier(record.pluginId) === normalizedIdentifier(candidate.owner)
    && normalizedVersion(record.version) === normalizedVersion(candidate.version)
    && record.available === true
    && installRecordOutsideShared(record, input.sharedRoot, platform))
  return { kind: 'plugin-install', identity: candidate.owner,
    ...(candidate.version ? { version: candidate.version } : {}), state: present ? 'present' : 'missing' }
}

function installRecordOutsideShared(
  record: DoctorInstalledRuntimeSource,
  sharedRoot: string,
  platform: PathPlatform,
): boolean {
  return [record.installPath, record.installLocation].some((value) =>
    !!value && isOutsideShared(value, record.registryFile, sharedRoot, platform))
}

function isOutsideShared(
  value: string,
  sourceFile: string,
  sharedRoot: string,
  platform: PathPlatform,
): boolean {
  return !isPathEqualOrUnder(resolveRuntimePath(value, sourceFile, platform), sharedRoot, platform)
}

function normalizedVersion(value: string | undefined): string {
  return value?.normalize('NFKC').trim() ?? ''
}

function resolveRuntimePath(value: string, sourceFile: string, platform: PathPlatform): string {
  const api = platform === 'win32' ? path.win32 : path.posix
  return api.normalize(api.isAbsolute(value) ? value : api.resolve(api.dirname(sourceFile), value))
}

function isPathEqualOrUnder(candidate: string, root: string, platform: PathPlatform): boolean {
  const api = platform === 'win32' ? path.win32 : path.posix
  const relative = api.relative(api.resolve(root), api.resolve(candidate))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${api.sep}`) && !api.isAbsolute(relative))
}

function inferredPlatform(value: string): PathPlatform {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value) ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'
}
