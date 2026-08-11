// claude-doctor-audit-async.ts — kooperative D1-D11-Orchestrierung fuer Async-Scans.
import path from 'node:path'
import type { Category } from '@shared/contract'
import { buildClaudeDoctorContext } from './claude-doctor-context'
import type { ClaudeDoctorContext } from './claude-doctor-context'
import { auditClaudeStateAsync } from './claude-state-audit'
import { auditComponentDuplicates, auditMcpSourceOverlaps } from './claude-source-audit'
import { auditClaudeHookRuntime } from './claude-hook-runtime-audit'
import { auditClaudeHookStatic } from './claude-hook-static-audit'
import { auditClaudeSkillListingBudget } from './claude-skill-budget-audit'
import {
  RULE_NAMES, category, discover, findingRows, runtimeContextTokens, sharedRows, skillSettings,
} from './claude-doctor-audit'
import type { ClaudeDoctorAuditOptions, Discovery, DoctorRow } from './claude-doctor-audit'
import { yieldToEventLoop } from '../lib/yield-loop'

function sourceRows(context: ClaudeDoctorContext, found: Discovery): DoctorRow[] {
  const rows: DoctorRow[] = auditMcpSourceOverlaps(context.mcpServices, context.canonicalPorts)
    .map((finding) => ({ rule: 'D4', name: `D4 · ${RULE_NAMES.D4}`,
      path: context.paths.claudeHome, reason: finding.signal,
      fields: { Quellen: `${finding.left.scope}/${finding.right.scope}`,
        Tools: String(finding.toolOverlapCount) } }))
  rows.push(...auditComponentDuplicates(found.components).map((finding) => ({ rule: 'D5',
    name: `D5 · ${finding.name}`, path: finding.source.filePath,
    reason: `${finding.componentKind}: ${finding.source.scope}/plugin` })))
  rows.push(...sharedRows(context))
  return rows
}

function hookRows(context: ClaudeDoctorContext, found: Discovery): DoctorRow[] {
  const runtime = auditClaudeHookRuntime({ transcriptRoots: context.paths.transcriptCandidates,
    limits: context.limits.transcripts })
  const rows: DoctorRow[] = runtime.runtimes.filter((item) => item.timeouts > 0).map((item) => ({
    rule: 'D7', name: `D7 · ${item.hookName}`,
    path: context.paths.transcriptCandidates[0] ?? context.paths.claudeHome,
    reason: `${item.timeouts} beobachtete Timeouts`, fields: { Event: item.hookEvent,
      p50ms: String(item.p50Ms ?? 'n/a'), p90ms: String(item.p90Ms ?? 'n/a') } }))
  const staticAudit = auditClaudeHookStatic({ settingsLayers: context.settings.layers,
    sourcePaths: found.hookSources })
  rows.push(...staticAudit.configuration.map((item) => ({ rule: 'D8', name: `D8 · ${item.hookName}`,
    path: found.hookSources.find((candidate) => path.basename(candidate) === item.hookName)
      ?? context.paths.claudeHome, reason: item.labels.join(', '),
    fields: { Event: item.event, Timeout: String(item.timeoutSeconds ?? 'n/a') } })))
  rows.push(...runtime.errors.map((item) => ({ rule: 'D10', name: `D10 · ${item.hookName}`,
    path: context.paths.transcriptCandidates[0] ?? context.paths.claudeHome, reason: item.errorClass,
    fields: { Fingerprint: item.fingerprint, Anzahl: String(item.count) } })))
  rows.push(...staticAudit.undefinedIdentifiers.map((item) => ({ rule: 'D10', name: `D10 · ${item.name}`,
    path: item.filePath, reason: 'Undefinierter ALL-CAPS-Bezeichner', fields: { Zeile: String(item.line) } })))
  rows.push(...staticAudit.deliveryOrder.map((item) => ({ rule: 'D11',
    name: `D11 · ${path.basename(item.filePath)}`, path: item.filePath,
    reason: `${item.stateCall} vor ${item.deliveryCall}` })))
  return rows
}

function skillRows(context: ClaudeDoctorContext, found: Discovery,
  options: ClaudeDoctorAuditOptions): DoctorRow[] {
  try {
    return findingRows(context, auditClaudeSkillListingBudget(found.listing,
      skillSettings(context, found, options.env ?? process.env), runtimeContextTokens(options)).findings)
  } catch {
    return [{ rule: 'D9', name: `D9 · ${RULE_NAMES.D9}`,
      path: context.paths.settings.user ?? context.paths.claudeHome,
      reason: 'Ungültige Skill-Budget-Einstellung' }]
  }
}

export async function buildClaudeDoctorCategoriesAsync(
  options: ClaudeDoctorAuditOptions = {}
): Promise<Category[]> {
  const context = buildClaudeDoctorContext(options.context)
  const found = discover(context)
  await yieldToEventLoop()
  const rows = findingRows(context, await auditClaudeStateAsync(context, {
    plugins: found.plugins, skills: found.skills, ruleWikilinks: found.ruleWikilinks,
  }))
  await yieldToEventLoop()
  rows.push(...sourceRows(context, found))
  await yieldToEventLoop()
  rows.push(...hookRows(context, found))
  await yieldToEventLoop()
  rows.push(...skillRows(context, found, options))
  return category(rows, context.paths.claudeHome)
}
