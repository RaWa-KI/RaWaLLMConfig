// Geteilte Utility: bekannte Zielpfade fuer PathPicker (sichtbar, nie Secrets).
// Wird von EntryActions.tsx (Datei-Move) UND Dir-Reconcile-UI (Ordner-Move) genutzt.
// Separator-robust (/, \), dedupliziert + sortiert.
import type { AppData } from '@shared/contract'

// Skills/Agents liegen als <root>/<name>/<datei>. Der nackte Kategorie-Root
// (cat.path, z.B. .shared/.claude/skills) taugt NICHT als Datei-Ziel — ein
// dorthin verschobenes File umginge die Subordner-Konvention. Erkennung ueber
// das Kategorie-Suffix (skills/agents, auch codex-/shared-Praefix). Die echten
// Subordner-Vorschlaege kommen weiter aus dirname(e.path) je Eintrag.
function isSubfolderCat(catId: string): boolean {
  return /(^|-)(skills|agents)$/.test(catId)
}

export function buildKnownPaths(data: AppData | null, llm: string, parentPath: string): string[] {
  const set = new Set<string>()
  // Ueber ALLE Familien sammeln, nicht nur die aktuell gewaehlte `llm`: ein
  // Cross-Family-Move (z.B. Claude -> Shared) muss die ZIEL-Familien-Wurzel finden
  // (resolveFamilyRoot in move-target.ts). Stehen nur die `.claude`-Pfade der
  // aktuellen Familie drin, liefert resolveFamilyRoot('shared', …) undefined ->
  // leeres Ziel -> Move scheitert/verliert. Aktuelle Familie zuerst (PathPicker-
  // Reihenfolge), die uebrigen danach (auch ihre Ordner werden waehlbare Vorschlaege).
  const fams = Object.keys(data?.data ?? {})
  for (const fam of [llm, ...fams.filter((f) => f !== llm)]) {
    for (const cat of data?.data[fam]?.categories ?? []) {
      if (cat.path && !isSubfolderCat(cat.id)) set.add(cat.path)
      for (const e of cat.entries) {
        const i = Math.max(e.path.lastIndexOf('/'), e.path.lastIndexOf('\\'))
        set.add(i >= 0 ? e.path.slice(0, i) : e.path)
      }
    }
  }
  if (parentPath) set.add(parentPath)
  return [...set].filter(Boolean)
}
