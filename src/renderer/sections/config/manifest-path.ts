// manifest-path.ts — Renderer-Pfad-Helfer fuer Item-ORDNER-Eintraege (Skill/
// Agent/Teams/Plugins). Der Scanner setzt bei diesen Ordnern den Set-Pfad
// (d.trunk.path/d.mirror.path) auf die DEFINITIONSDATEI (SKILL.md/AGENT.md bzw.
// teams/config.json, plugins/plugin.json), nicht auf den Ordner selbst.
// Eintrags-Kopf-Aktionen (Umbenennen/Verschieben) muessen beim ORDNER-Eintrag
// aber den ORDNER treffen, sonst wird nur das Manifest umbenannt (Bug A).
//
// Die Manifest-Erkennung + dirname-Logik kommt jetzt ZENTRAL aus
// shared/manifest-map.ts (eine Quelle fuer Renderer UND Main, kontext-bewusst:
// config.json nur im /teams/-, plugin.json/package.json nur im /plugins/-Pfad).
// Kein fs/path im Renderer: rein String-/Trenner-treu ('/' oder '\').
import { isManifestPath, manifestParent, manifestFolder } from '@shared/manifest-map'

// Re-Export der zentralen Helfer unter den bisherigen Renderer-Namen, damit
// bestehende Importe (DuplicatePanel) unveraendert bleiben.

/** True, wenn `p` auf eine Item-Ordner-Manifestdatei zeigt (kontext-bewusst). */
export { isManifestPath }

/** Eltern-Ordner eines Pfades (Trenner-treu, ohne fs/path im Renderer). */
export const dirOf = manifestParent

/**
 * Ordnerpfad fuer einen Eintrag, dessen Aktionen den ORDNER treffen sollen:
 * bei Manifest-Pfaden der enthaltende Ordner, sonst der Pfad unveraendert
 * (bereits ein Ordner, z.B. wenn eine Seite direkt auf den Item-Ordner zeigt).
 */
export function folderPathOf(p: string | undefined): string | undefined {
  if (!p) return p
  return manifestFolder(p)
}
