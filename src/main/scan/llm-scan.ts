// Scanner: lokale LLMs (GGUF-Modelle + bekannte Inferenz-Endpoints).
// Phase 1 strikt read-only: liest nur Dateinamen/Groessen aus dem lokalen
// GGUF-Ordner, NIE Modell-Datei-Inhalte. Quelle der Endpoint-Struktur:
// _entpackt/uploads/VALIDATED_REFERENCE-system-environment-local-llm_2026-06-04.md
// (llama-server :8099, Brain-Adapter :11500).
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { Category, ComingSoon, ConfigEntry, DiffLabels, LlmConfig } from '@shared/contract'
import { normalizePathForCompare } from '@shared/path-compare'
import { fmtSize } from '../lib/fmt-size'
import { userSourceRootsForProvider } from '../services/config-roots'

// DiffLabels fuer lokale Familie: kein Shared-Trunk-Vergleich moeglich
// (GGUF-Binaerdateien + Endpoints sind nicht reconcile-faehig).
const LOCAL_DIFF_LABELS: DiffLabels = {
  trunk: 'Lokal (Primaer)',
  mirror: 'Keine Vergleichsquelle',
  trunkTag: 'local',
  mirrorTag: 'n-a',
}

// comingSoon-Text, wenn der GGUF-Ordner fehlt. Logik-neutral aus dem
// scanLocalLlm-Frueh-Return hochgezogen (byte-identisch), damit B-5 die
// buildData-Ebene am Alt-Code verankern kann statt den Text zu duplizieren.
const LOCAL_COMING_SOON: ComingSoon = {
  title: 'Lokale LLMs nicht erreichbar',
  text: 'Lokaler GGUF-Ordner wurde nicht gefunden. Waehle einen Modellordner oder nutze RAWALLM_GGUF_ROOT; Inferenz-Endpoints werden angezeigt, sobald ein lokaler Server erreichbar ist.',
}

// Basis-Pfad: public-freundlicher Default unter dem Benutzerprofil, optional
// per RAWALLM_GGUF_ROOT auf ein lokales Modell-Laufwerk umlegbar.
export const GGUF_ROOT = process.env.RAWALLM_GGUF_ROOT || join(homedir(), 'models', 'gguf')
const GGUF_EXT = '.gguf'
const WINDOWS_MODEL_DRIVES = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function externalGgufCandidates(): string[] {
  if (process.platform !== 'win32') return []
  return WINDOWS_MODEL_DRIVES.map((drive) => `${drive}:\\models\\gguf`)
}

function dedupeRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const root of roots) {
    const key = normalizePathForCompare(root.trim(), process.platform)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(root)
  }
  return out
}

export function ggufRoots(): string[] {
  return dedupeRoots([GGUF_ROOT, ...externalGgufCandidates(), ...userSourceRootsForProvider('local')])
}

/** mtime als ISO-Datum (ohne Uhrzeit), graceful bei Fehler. */
function mtimeIso(absPath: string): string {
  try {
    return statSync(absPath).mtime.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

/** Verzeichnis lesen, nur Eintragsnamen — wirft nie. */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'ERR'
    console.error('[scan:llm]', `readdir fehlgeschlagen (${String(code)})`)
    return []
  }
}

/** Ein GGUF-File zu einem ConfigEntry mappen (nur Name/Groesse/mtime). */
function toEntry(absPath: string, fileName: string, modelDir: string): ConfigEntry {
  let bytes = 0
  try {
    bytes = statSync(absPath).size
  } catch {
    bytes = 0
  }
  const isMmproj = /^mmproj/i.test(fileName)
  return {
    id: `gguf-${modelDir}-${fileName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: fileName,
    status: 'active',
    scope: 'local',
    path: absPath,
    desc: isMmproj ? `Vision-Projektor (${modelDir})` : `GGUF-Modell (${modelDir})`,
    updated: mtimeIso(absPath),
    fields: { Modell: modelDir, groesse: fmtSize(bytes), Typ: 'GGUF' },
  }
}

/** GGUF-Wurzeln rekursiv (1 Ebene tief) nach *.gguf scannen. */
function scanGgufFiles(roots = ggufRoots()): ConfigEntry[] {
  const entries: ConfigEntry[] = []
  for (const root of roots.filter((item) => existsSync(item))) {
    for (const name of safeReaddir(root)) {
      const child = join(root, name)
      let isDir = false
      try {
        isDir = statSync(child).isDirectory()
      } catch {
        isDir = false
      }
      if (isDir) {
        for (const inner of safeReaddir(child)) {
          if (inner.toLowerCase().endsWith(GGUF_EXT)) {
            entries.push(toEntry(join(child, inner), inner, name))
          }
        }
      } else if (name.toLowerCase().endsWith(GGUF_EXT)) {
        entries.push(toEntry(child, name, basename(root) || 'gguf'))
      }
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

/** Projektinterne lokale Inferenz-Endpoints aus der validierten Referenz. */
function projectEndpointEntries(): ConfigEntry[] {
  return [
    {
      id: 'llama-server-8099',
      name: 'llama-server',
      status: 'stale',
      scope: 'local',
      path: 'http://127.0.0.1:8099/v1/chat/completions',
      desc: 'Primaerer Inferenz-Endpoint (llama.cpp, GGUF, manueller Start)',
      updated: '2026-06-04',
      fields: { Port: '8099', Backend: 'Vulkan+CUDA', API: 'OpenAI /v1' },
    },
    {
      id: 'brain-adapter-11500',
      name: 'LLMS Brain-Adapter',
      status: 'stale',
      scope: 'local',
      path: 'http://127.0.0.1:11500',
      desc: 'OpenAI-/v1-Adapter mit RAG/Tools vor llama-server (reserved)',
      updated: '2026-06-04',
      fields: { Port: '11500', Status: 'reserved', API: 'OpenAI /v1' },
    }
  ]
}

/** Verbreitete lokale Runner mit Standard-Ports und manuellem Start. */
function publicEndpointEntries(): ConfigEntry[] {
  return [
    // ── Verbreitete lokale Runner (OSS Teil D): Standard-Ports, manueller Start.
    // status 'stale' = bekannter Default-Endpoint, NICHT auf Erreichbarkeit
    // geprueft (die App ruft nie selbst auf). Fuer-jeden-nutzbar-Scope.
    {
      id: 'ollama-11434',
      name: 'Ollama',
      status: 'stale',
      scope: 'local',
      path: 'http://127.0.0.1:11434/v1',
      desc: 'Ollama OpenAI-kompatibler Endpoint (Standard-Port, manueller Start)',
      updated: '',
      fields: { Port: '11434', Backend: 'Ollama', API: 'OpenAI /v1' },
    },
    {
      id: 'lmstudio-1234',
      name: 'LM Studio',
      status: 'stale',
      scope: 'local',
      path: 'http://127.0.0.1:1234/v1',
      desc: 'LM Studio lokaler Server (Standard-Port, manueller Start)',
      updated: '',
      fields: { Port: '1234', Backend: 'LM Studio', API: 'OpenAI /v1' },
    },
    {
      id: 'vllm-8000',
      name: 'vLLM',
      status: 'stale',
      scope: 'local',
      path: 'http://127.0.0.1:8000/v1',
      desc: 'vLLM OpenAI-kompatibler Server (Standard-Port, manueller Start)',
      updated: '',
      fields: { Port: '8000', Backend: 'vLLM', API: 'OpenAI /v1' },
    },
  ]
}

/** Bekannte lokale Inferenz-Endpoints (Topologie aus validierter Referenz). */
function endpointEntries(): ConfigEntry[] {
  return [...projectEndpointEntries(), ...publicEndpointEntries()]
}

// B-4: additive Exporte fuer das datengetriebene llm-Manifest (CustomCategory).
// NUR Sichtbarmachung der bewaehrten Bestands-Funktionen — Logik UNVERAENDERT.
// scanGgufFiles/endpointEntries liefern die Eintraege; das Manifest baut die
// Category-Huellen exakt wie scanLocalLlm (gleiche id/label/icon/path/blurb).
// B-5: LOCAL_DIFF_LABELS (Manifest-diffLabels) + LOCAL_COMING_SOON (buildData-
// Frueh-Return-Reproduktion) zusaetzlich sichtbar — beides bestehende Werte.
export { scanGgufFiles, endpointEntries, LOCAL_DIFF_LABELS, LOCAL_COMING_SOON }

/**
 * Lokale LLMs scannen. Read-only: nur Dateinamen/Groessen, nie Inhalte.
 * Ohne GGUF_ROOT -> comingSoon + leere categories.
 */
export function scanLocalLlm(): LlmConfig {
  try {
    const roots = ggufRoots().filter((root) => existsSync(root))
    if (roots.length === 0) {
      return {
        categories: [],
        duplicates: [],
        diffLabels: LOCAL_DIFF_LABELS,
        comingSoon: LOCAL_COMING_SOON,
      }
    }

    const models = scanGgufFiles(roots)
    const categories: Category[] = [
      {
        id: 'gguf-models',
        label: 'GGUF-Modelle',
        icon: 'list',
        path: roots.length === 1 ? roots[0] : `${roots.length} Modellordner`,
        blurb: 'Lokale Modelle fuer llama-server (read-only, nur Datei-Metadaten)',
        entries: models,
      },
      {
        id: 'llm-endpoints',
        label: 'Inferenz-Endpoints',
        icon: 'api',
        path: 'http://127.0.0.1',
        blurb: 'Bekannte lokale OpenAI-kompatible Endpoints (manueller Start)',
        entries: endpointEntries(),
      },
    ]

    return { categories, duplicates: [], diffLabels: LOCAL_DIFF_LABELS }
  } catch (err) {
    console.error('[scan:llm]', String((err as Error).message ?? 'unbekannter Fehler'))
    return { categories: [], duplicates: [], diffLabels: LOCAL_DIFF_LABELS }
  }
}
