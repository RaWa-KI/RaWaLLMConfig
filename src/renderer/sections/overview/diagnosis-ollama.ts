import type { AppData, SystemEntry } from '@shared/contract'

interface OllamaDiagnosisCopy {
  title: string
  meaning: string
  where: string
  how: string
  changeHint: string
}

export function ollamaDiagnosisCopy(config: AppData | null): OllamaDiagnosisCopy {
  const modelFolder = configuredModelFolder(config)
  return {
    title: 'Lokale Modelle prüfen',
    meaning: 'Die App hat Hinweise zu Ollama gefunden. Das allein sagt nicht, ob deine Modelle am eingestellten Ort verfügbar sind.',
    where: 'Einstellungen > Lokale Quellen',
    how: 'Öffne Lokale Quellen und vergleiche den eingerichteten Modellordner mit den gefundenen Hinweisen.',
    changeHint: modelFolder
      ? `Der eingerichtete Modellordner ist ${modelFolder}. Prüfe dort, ob die Modelle vorhanden sind; passe die Quelle nur an, wenn der Ordner nicht stimmt.`
      : 'Es ist noch kein Modellordner in der App eingerichtet. Verbinde nur den Ordner, den du für lokale Modelle verwendest.'
  }
}

export function isOllamaHint(areaId: string, entry: SystemEntry): boolean {
  return `${areaId} ${entry.id ?? ''} ${entry.name} ${entry.desc}`.toLowerCase().includes('ollama')
}

export function ollamaEvidence(entry: SystemEntry): string {
  return `${entry.name}: ${entry.conflictReason ?? entry.path ?? entry.desc}`
}

function configuredModelFolder(config: AppData | null): string | undefined {
  const local = config?.data.local
  if (!local) return undefined
  const category = local.categories.find((item) => /model|gguf|ollama/i.test(`${item.id} ${item.label}`))
  return category?.path || category?.entries.find((entry) => /model|gguf|ollama/i.test(`${entry.id} ${entry.name}`))?.path
}
