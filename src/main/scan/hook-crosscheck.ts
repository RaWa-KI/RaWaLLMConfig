// hook-crosscheck.ts — C-04/A1-5 isolierter Hook-Crosscheck.
// Vergleicht command-Pfade aus settings/hooks.json mit Hook-Scripts in hooks/*.
import path from 'node:path'
import { normalizePathForCompare } from '@shared/path-compare'
import { listFilesDeep, pathExists, readJsonFile, slashPath } from './c04-scan-helpers'

export interface HookCrosscheckInput {
  registrationFiles: string[]
  hookDirs: string[]
}

export type HookCrosscheckFinding =
  | { kind: 'orphan-registration'; filePath: string; command: string; commandPath: string; reason: string }
  | { kind: 'orphan-script'; filePath: string; reason: string }

const SCRIPT_EXTENSIONS = new Set(['.cjs', '.mjs', '.js', '.ts', '.ps1', '.sh', '.py'])

export function crosscheckHooks(input: HookCrosscheckInput): HookCrosscheckFinding[] {
  const scripts = hookScripts(input.hookDirs)
  const registered = registeredCommands(input.registrationFiles)
  return [
    ...missingCommandFindings(registered),
    ...orphanScriptFindings(scripts, registered),
  ]
}

interface RegisteredCommand {
  registrationFile: string
  command: string
  commandPath: string
}

function hookScripts(hookDirs: string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const dir of hookDirs) {
    for (const file of listFilesDeep(dir, isHookScript)) out.set(norm(file), file)
  }
  return out
}

function registeredCommands(files: string[]): RegisteredCommand[] {
  const out: RegisteredCommand[] = []
  for (const file of files) {
    const data = readJsonFile(file)
    for (const command of commandStrings(data)) {
      const commandPath = extractCommandPath(command, path.dirname(file))
      if (commandPath) out.push({ registrationFile: file, command, commandPath })
    }
  }
  return out
}

function commandStrings(node: unknown): string[] {
  const out: string[] = []
  collectCommands(node, out)
  return out
}

function collectCommands(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectCommands(item, out)
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'command' && typeof value === 'string') out.push(value)
      else collectCommands(value, out)
    }
  }
}

function extractCommandPath(command: string, baseDir: string): string {
  for (const token of commandTokens(command)) {
    const candidate = normalizeToken(token, baseDir)
    if (candidate && SCRIPT_EXTENSIONS.has(path.extname(candidate).toLowerCase())) return candidate
  }
  return ''
}

function commandTokens(command: string): string[] {
  return [...command.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)]
    .map((match) => match[1] || match[2] || match[3])
}

function normalizeToken(token: string, baseDir: string): string {
  if (/^[-/]/.test(token) && !path.isAbsolute(token)) return ''
  return path.resolve(baseDir, token)
}

function missingCommandFindings(commands: RegisteredCommand[]): HookCrosscheckFinding[] {
  return commands
    .filter((cmd) => !pathExists(cmd.commandPath))
    .map((cmd) => ({
      kind: 'orphan-registration',
      filePath: cmd.registrationFile,
      command: cmd.command,
      commandPath: cmd.commandPath,
      reason: 'command-path-missing',
    }))
}

function orphanScriptFindings(scripts: Map<string, string>, commands: RegisteredCommand[]): HookCrosscheckFinding[] {
  const registered = new Set(commands.map((cmd) => norm(cmd.commandPath)))
  return [...scripts.entries()]
    .filter(([script]) => !registered.has(script))
    .map(([, filePath]) => ({ kind: 'orphan-script', filePath, reason: 'script-not-registered' }))
}

function isHookScript(absPath: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(absPath).toLowerCase())
}

function norm(absPath: string): string {
  return normalizePathForCompare(slashPath(path.resolve(absPath)), process.platform)
}
