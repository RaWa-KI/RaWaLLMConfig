import type { AppData, Category, ConfigEntry, LlmConfig, LlmDef } from '@shared/contract'
import type { RefArtifact, RefDataset, RefField } from '@shared/contract-referenz'
import { refdataClaude } from './refdata'
import { refdataCodex } from './refdata-codex'

export type ReferenceMode = 'environment' | 'commands'

const STATIC_DATASETS: Record<string, RefDataset> = {
  claude: refdataClaude,
  codex: refdataCodex
}

const FALLBACK_MODELS: LlmDef[] = [
  { id: 'claude', glyph: '✳', name: 'Claude', sub: 'Anthropic', color: 'var(--terra)', path: '~/.claude' },
  { id: 'codex', glyph: '◇', name: 'Codex', sub: 'OpenAI', color: 'var(--papa)', path: '~/.codex' }
]

export function referenceModels(data: AppData | null): LlmDef[] {
  return data?.llms.length ? data.llms : FALLBACK_MODELS
}

export function datasetForModel(data: AppData | null, modelId: string, mode: ReferenceMode): RefDataset {
  const model = referenceModels(data).find((item) => item.id === modelId)
  const base = STATIC_DATASETS[modelId] ?? datasetFromScan(modelId, model, data?.data[modelId])
  return mode === 'commands' ? commandDataset(base) : base
}

export function firstArtifactId(dataset: RefDataset, mode: ReferenceMode): string {
  if (mode === 'commands') return 'slash'
  return dataset.artifacts[0]?.id ?? 'empty'
}

function commandDataset(dataset: RefDataset): RefDataset {
  const slash = dataset.artifacts.find((artifact) => artifact.id === 'slash')
  if (slash) return { ...dataset, artifacts: [slash] }
  return {
    ...dataset,
    artifacts: [{
      id: 'slash',
      label: 'Befehle / Katalog',
      icon: 'term',
      file: 'in der jeweiligen Sitzung',
      tag: 'kein eigener Katalog gefunden',
      intro: `Für ${dataset.label} liegt aktuell kein eigener Befehlskatalog vor.`,
      fields: []
    }]
  }
}

function datasetFromScan(modelId: string, model: LlmDef | undefined, cfg: LlmConfig | undefined): RefDataset {
  const label = model?.name || modelId
  const artifacts = cfg?.categories.map(categoryArtifact) ?? []
  return {
    label,
    updated: 'live',
    source: 'lokaler Scan',
    artifacts: artifacts.length ? artifacts : [emptyArtifact(label)]
  }
}

function categoryArtifact(cat: Category): RefArtifact {
  return {
    id: cat.id,
    label: cat.label,
    icon: cat.icon,
    file: cat.path || 'lokaler Scan',
    tag: cat.blurb,
    intro: cat.blurb,
    fields: cat.entries.map(entryField)
  }
}

function entryField(entry: ConfigEntry): RefField {
  return {
    id: entry.id,
    key: entry.name,
    what: entry.desc || 'Gefundener Eintrag.',
    when: `Status: ${entry.status}`,
    safe: entry.path || undefined,
    example: fieldSummary(entry.fields),
    pitfall: entry.conflictReason
  }
}

function fieldSummary(fields: Record<string, string> | undefined): string | undefined {
  if (!fields) return undefined
  const entries = Object.entries(fields).slice(0, 3)
  return entries.length > 0 ? entries.map(([key, value]) => `${key}: ${value}`).join(' · ') : undefined
}

function emptyArtifact(label: string): RefArtifact {
  return {
    id: 'empty',
    label,
    icon: 'box',
    file: 'lokaler Scan',
    tag: 'noch keine Einträge',
    intro: 'Für diese Arbeitsumgebung wurden noch keine auswertbaren Einträge gefunden.',
    fields: []
  }
}
