// claude-hook-static-audit.ts — konservative D8/D10/D11-Hook-Pruefungen.
// Findings enthalten nie Commands oder Quelltextausschnitte.
import fs from 'node:fs'
import path from 'node:path'
import type { DoctorSettingsLayer } from './claude-doctor-context'

type HookConfigRuleLabel = 'event-threshold-2s' | 'event-threshold-10s'
  | 'hard-cap-60s' | 'heavy-network-client' | 'heavy-package-manager' | 'heavy-cold-interpreter'

interface HookConfigFinding {
  rule: 'D8'; kind: 'hook-config-risk'; layer: string; event: string; hookName: string
  timeoutSeconds?: number; async: boolean; labels: HookConfigRuleLabel[]
}

interface UndefinedIdentifierFinding {
  rule: 'D10'; kind: 'undefined-all-caps'; filePath: string; name: string; line: number
}

interface DeliveryOrderFinding {
  rule: 'D11'; kind: 'state-before-delivery'; filePath: string; functionName: string
  stateCall: string; stateLine: number; deliveryCall: string; deliveryLine: number
}

export interface HookStaticAuditInput {
  settingsLayers: DoctorSettingsLayer[]
  sourcePaths: string[]
  stateCallTails?: string[]
  deliveryCallTails?: string[]
  readText?: (filePath: string) => string
}

interface HookStaticCoverage {
  candidateFiles: number; analyzedFiles: number; unreadableFiles: number; skippedUnsupported: number
}

export interface HookStaticAuditResult {
  configuration: HookConfigFinding[]
  undefinedIdentifiers: UndefinedIdentifierFinding[]
  deliveryOrder: DeliveryOrderFinding[]
  coverage: HookStaticCoverage
}

interface Token { value: string; line: number }
interface FunctionRange { marker: number; open: number; close: number; name: string }

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const ALL_CAPS = /^[A-Z][A-Z0-9_]{1,63}$/
const GLOBAL_CAPS = new Set(['JSON', 'URL', 'URI', 'NaN', 'Infinity'])
const CONTROL = new Set(['if', 'else', 'switch', 'case', 'for', 'while', 'do', 'try', 'catch',
  'finally', 'return', 'throw', 'break', 'continue'])

function timeoutLabels(event: string, timeout: number | undefined): HookConfigRuleLabel[] {
  if (timeout === undefined) return []
  const baseEvent = event.split(':', 1)[0]
  const labels: HookConfigRuleLabel[] = []
  if (['PreToolUse', 'PostToolUse', 'UserPromptSubmit'].includes(baseEvent) && timeout > 2) {
    labels.push('event-threshold-2s')
  }
  if (['SessionStart', 'Stop'].includes(baseEvent) && timeout > 10) labels.push('event-threshold-10s')
  if (timeout > 60) labels.push('hard-cap-60s')
  return labels
}

function configurationFindings(layers: DoctorSettingsLayer[]): HookConfigFinding[] {
  const out: HookConfigFinding[] = []
  for (const layer of layers) {
    layer.hooks.forEach((hook, index) => {
      const labels = timeoutLabels(hook.event, hook.timeoutSeconds)
      if (hook.heavyClass) labels.push(`heavy-${hook.heavyClass}` as HookConfigRuleLabel)
      if (labels.length === 0) return
      const hookName = hook.scriptPath ? path.basename(hook.scriptPath) : `${hook.type}-${index + 1}`
      out.push({ rule: 'D8', kind: 'hook-config-risk', layer: layer.layer, event: hook.event,
        hookName, ...(hook.timeoutSeconds !== undefined ? { timeoutSeconds: hook.timeoutSeconds } : {}),
        async: hook.async, labels: [...new Set(labels)] })
    })
  }
  return out
}

function maskNonCode(source: string): string {
  const out: string[] = [...source].map((char) => char === '\n' || char === '\r' ? char : ' ')
  let mode: 'code' | 'single' | 'double' | 'line' | 'block' | 'template' = 'code'
  const templateDepth: number[] = []
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]; const next = source[i + 1]
    if (mode === 'line') { if (char === '\n') mode = 'code'; continue }
    if (mode === 'block') { if (char === '*' && next === '/') { i += 1; mode = 'code' }; continue }
    if (mode === 'single' || mode === 'double') {
      const quote = mode === 'single' ? "'" : '"'
      if (char === '\\') i += 1
      else if (char === quote) mode = 'code'
      continue
    }
    if (mode === 'template') {
      if (char === '\\') i += 1
      else if (char === '`') mode = 'code'
      else if (char === '$' && next === '{') {
        out[i + 1] = '{'; i += 1; templateDepth.push(0); mode = 'code'
      }
      continue
    }
    if (char === '/' && next === '/') { i += 1; mode = 'line'; continue }
    if (char === '/' && next === '*') { i += 1; mode = 'block'; continue }
    if (char === "'") { mode = 'single'; continue }
    if (char === '"') { mode = 'double'; continue }
    if (char === '`') { mode = 'template'; continue }
    out[i] = char
    if (templateDepth.length && char === '{') templateDepth[templateDepth.length - 1] += 1
    else if (templateDepth.length && char === '}') {
      const last = templateDepth.length - 1
      if (templateDepth[last] === 0) { templateDepth.pop(); mode = 'template' }
      else templateDepth[last] -= 1
    }
  }
  return out.join('')
}

function tokensFrom(source: string): Token[] {
  const masked = maskNonCode(source)
  const matcher = /=>|\?\.|[A-Za-z_$][A-Za-z0-9_$]*|[{}()[\].,:;=]/g
  const out: Token[] = []; let line = 1; let cursor = 0; let match: RegExpExecArray | null
  while ((match = matcher.exec(masked)) !== null) {
    for (let i = cursor; i < match.index; i += 1) if (masked[i] === '\n') line += 1
    out.push({ value: match[0], line }); cursor = matcher.lastIndex
  }
  return out
}

function matching(tokens: Token[], start: number, open: string, close: string): number {
  let depth = 0
  for (let i = start; i < tokens.length; i += 1) {
    if (tokens[i].value === open) depth += 1
    else if (tokens[i].value === close && --depth === 0) return i
  }
  return -1
}

function arrowName(tokens: Token[], marker: number): string {
  for (let i = marker - 1; i >= Math.max(0, marker - 8); i -= 1) {
    if (tokens[i].value === '=' && i > 0 && IDENTIFIER.test(tokens[i - 1].value)) return tokens[i - 1].value
    if ([';', '{', '}'].includes(tokens[i].value)) break
  }
  return `anonymous-${tokens[marker].line}`
}

function functionRanges(tokens: Token[]): FunctionRange[] {
  const out: FunctionRange[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].value !== 'function' && tokens[i].value !== '=>') continue
    let open = i + 1
    if (tokens[i].value === '=>' && tokens[open]?.value !== '{') continue
    while (tokens[i].value === 'function' && open < tokens.length
      && tokens[open].value !== '{' && tokens[open].value !== ';') open += 1
    if (tokens[open]?.value !== '{') continue
    const close = matching(tokens, open, '{', '}')
    if (close < 0) continue
    const named = tokens[i].value === 'function' && IDENTIFIER.test(tokens[i + 1]?.value ?? '')
      ? tokens[i + 1].value : arrowName(tokens, i)
    out.push({ marker: i, open, close, name: named })
  }
  return out.sort((a, b) => a.open - b.open || b.close - a.close)
}

function addParamDefinitions(tokens: Token[], range: FunctionRange, definitions: Set<string>): void {
  if (tokens[range.marker].value === 'function') {
    const open = tokens.findIndex((token, index) => index > range.marker && index < range.open && token.value === '(')
    if (open < 0) return
    const close = matching(tokens, open, '(', ')')
    for (let i = open + 1; i < close; i += 1) if (ALL_CAPS.test(tokens[i].value)) definitions.add(tokens[i].value)
    return
  }
  const previous = tokens[range.marker - 1]
  if (previous && IDENTIFIER.test(previous.value)) definitions.add(previous.value)
  if (previous?.value !== ')') return
  let depth = 0; let open = range.marker - 1
  for (; open >= 0; open -= 1) {
    if (tokens[open].value === ')') depth += 1
    else if (tokens[open].value === '(' && --depth === 0) break
  }
  for (let i = open + 1; i < range.marker - 1; i += 1) if (ALL_CAPS.test(tokens[i].value)) definitions.add(tokens[i].value)
}

function definitionsFrom(tokens: Token[], ranges: FunctionRange[]): Set<string> {
  const out = new Set(GLOBAL_CAPS)
  for (const range of ranges) {
    if (ALL_CAPS.test(range.name)) out.add(range.name)
    addParamDefinitions(tokens, range, out)
  }
  for (let i = 0; i < tokens.length; i += 1) {
    if (['const', 'let', 'var'].includes(tokens[i].value)) {
      for (let j = i + 1; j < tokens.length && !['=', ';'].includes(tokens[j].value); j += 1) {
        if (ALL_CAPS.test(tokens[j].value)) out.add(tokens[j].value)
      }
    } else if (['class', 'function'].includes(tokens[i].value) && ALL_CAPS.test(tokens[i + 1]?.value ?? '')) {
      out.add(tokens[i + 1].value)
    } else if (tokens[i].value === 'import') {
      for (let j = i + 1; j < tokens.length && tokens[j].value !== 'from' && tokens[j].value !== ';'; j += 1) {
        if (ALL_CAPS.test(tokens[j].value)) out.add(tokens[j].value)
      }
    } else if (tokens[i].value === 'catch' && tokens[i + 1]?.value === '(') {
      const close = matching(tokens, i + 1, '(', ')')
      for (let j = i + 2; j < close; j += 1) if (ALL_CAPS.test(tokens[j].value)) out.add(tokens[j].value)
    }
  }
  return out
}

function undefinedIdentifiers(filePath: string, tokens: Token[], ranges: FunctionRange[]): UndefinedIdentifierFinding[] {
  const defined = definitionsFrom(tokens, ranges); const seen = new Set<string>()
  const out: UndefinedIdentifierFinding[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const name = tokens[i].value
    if (!ALL_CAPS.test(name) || defined.has(name) || seen.has(name)) continue
    if (['.', '?.'].includes(tokens[i - 1]?.value) || tokens[i + 1]?.value === ':') continue
    seen.add(name); out.push({ rule: 'D10', kind: 'undefined-all-caps', filePath, name, line: tokens[i].line })
  }
  return out
}

function insideNested(index: number, owner: FunctionRange, ranges: FunctionRange[]): FunctionRange | undefined {
  return ranges.find((range) => range !== owner && range.open <= index && index <= range.close
    && range.open > owner.open && range.close < owner.close)
}

function callAt(tokens: Token[], index: number, tails: Set<string>): string | undefined {
  const value = tokens[index].value
  if (!tails.has(value) || tokens[index + 1]?.value !== '(' || tokens[index - 1]?.value === 'function') return undefined
  return value
}

function unsafeBoundary(tokens: Token[], start: number, end: number): boolean {
  for (let i = start + 1; i < end; i += 1) {
    if (CONTROL.has(tokens[i].value) || tokens[i].value === 'function' || tokens[i].value === '=>') return true
    if (tokens[i].value === '{' || tokens[i].value === '}') return true
  }
  return false
}

function orderFindings(
  filePath: string, tokens: Token[], ranges: FunctionRange[], stateTails: Set<string>, deliveryTails: Set<string>,
): DeliveryOrderFinding[] {
  const out: DeliveryOrderFinding[] = []
  for (const range of ranges) {
    const states: Array<{ index: number; name: string }> = []
    const deliveries: Array<{ index: number; name: string }> = []
    let depth = 0
    for (let i = range.open + 1; i < range.close; i += 1) {
      const nested = insideNested(i, range, ranges)
      if (nested) { i = nested.close; continue }
      if (tokens[i].value === '{') { depth += 1; continue }
      if (tokens[i].value === '}') { depth -= 1; continue }
      if (depth !== 0) continue
      const state = callAt(tokens, i, stateTails); const delivery = callAt(tokens, i, deliveryTails)
      if (state) states.push({ index: i, name: state })
      if (delivery) deliveries.push({ index: i, name: delivery })
    }
    for (const state of states) {
      const delivery = deliveries.find((item) => item.index > state.index
        && !unsafeBoundary(tokens, state.index, item.index))
      if (!delivery) continue
      out.push({ rule: 'D11', kind: 'state-before-delivery', filePath, functionName: range.name,
        stateCall: state.name, stateLine: tokens[state.index].line,
        deliveryCall: delivery.name, deliveryLine: tokens[delivery.index].line })
    }
  }
  return out
}

export function auditClaudeHookStatic(input: HookStaticAuditInput): HookStaticAuditResult {
  const coverage: HookStaticCoverage = { candidateFiles: input.sourcePaths.length, analyzedFiles: 0,
    unreadableFiles: 0, skippedUnsupported: 0 }
  const undefinedOut: UndefinedIdentifierFinding[] = []; const orderOut: DeliveryOrderFinding[] = []
  const readText = input.readText ?? ((filePath: string) => fs.readFileSync(filePath, 'utf8'))
  const stateTails = new Set(input.stateCallTails ?? ['saveState', 'markSeen'])
  const deliveryTails = new Set(input.deliveryCallTails ?? ['write', 'inject', 'emit'])
  for (const filePath of [...new Set(input.sourcePaths)]) {
    if (!['.js', '.cjs'].includes(path.extname(filePath).toLowerCase())) {
      coverage.skippedUnsupported += 1; continue
    }
    let source: string
    try { source = readText(filePath) } catch { coverage.unreadableFiles += 1; continue }
    coverage.analyzedFiles += 1
    const tokens = tokensFrom(source); const ranges = functionRanges(tokens)
    undefinedOut.push(...undefinedIdentifiers(filePath, tokens, ranges))
    orderOut.push(...orderFindings(filePath, tokens, ranges, stateTails, deliveryTails))
  }
  return { configuration: configurationFindings(input.settingsLayers),
    undefinedIdentifiers: undefinedOut, deliveryOrder: orderOut, coverage }
}
