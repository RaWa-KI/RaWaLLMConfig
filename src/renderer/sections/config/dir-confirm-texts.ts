// dir-confirm-texts.ts — Text-Helfer des Ordner-Bestaetigungs-Blocks (HR27-Split
// aus DirConfirmBlock.tsx, damit dort die Plan-Vorschau Platz hat). Rein textuell:
// kein React/JSX, kein Bridge-/fs-Zugriff, keine Logik ausser Textauswahl.
// Sichtbare Texte kommen ausschliesslich aus @shared/dup-labels; code-interne
// Aktions-Typnamen (keep-trunk, adopt-mirror, …) bleiben unveraendert.
import { CONFIRM, ordnerConfirm, intraOrdnerConfirm } from '@shared/dup-labels'
import type { Seite, IntraAktionTexte } from '@shared/dup-labels'

// Reconcile-Aktionen sind symmetrisch (Finding B): keep-trunk/adopt-mirror behalten/
// uebernehmen die Shared-Seite, keep-mirror/adopt-trunk spiegeln das fuer die
// Claude-Seite. archive-/move-dir|mirror sind die Ganz-Ordner-Aktionen.
export type DirAction =
  | 'keep-trunk'
  | 'keep-mirror'
  | 'adopt-mirror'
  | 'adopt-trunk'
  | 'archive-dir'
  | 'move-dir'
  | 'archive-mirror'
  | 'move-mirror'

// Confirm-Textsatz (Bestand CONFIRM(seite) ODER feldkompatibles Intra-Pendant).
export type ConfirmTexte = ReturnType<typeof CONFIRM>

// Ganz-Ordner-Confirm-Texte: Intra-Paare nennen die Fassung (Fundstelle A/B),
// Cross-Root-Paare behalten den Bestand (Shared bzw. lokale Kopie).
function ordnerTexte(
  art: 'verschieben' | 'archivieren',
  trunkSeite: boolean,
  name: string,
  seite: Seite,
  intra: IntraAktionTexte | null
): { titel: string; text: string } {
  if (intra) return intraOrdnerConfirm(art, trunkSeite ? 'a' : 'b', name, intra.fassungen)
  return ordnerConfirm(art, trunkSeite ? 'shared' : seite, name)
}

export function actionTitle(
  action: DirAction,
  name: string,
  seite: Seite,
  c: ConfirmTexte,
  intra: IntraAktionTexte | null
): string {
  switch (action) {
    case 'keep-trunk':
      return `${c.titelBehalten} (${name})`
    case 'keep-mirror':
      return `${c.titelBehaltenMirror} (${name})`
    case 'adopt-mirror':
      return `${c.titelUebernehmen} (${name})`
    case 'adopt-trunk':
      return `${c.titelUebernehmenTrunk} (${name})`
    case 'archive-dir':
      return ordnerTexte('archivieren', true, name, seite, intra).titel
    case 'move-dir':
      return ordnerTexte('verschieben', true, name, seite, intra).titel
    case 'archive-mirror':
      return ordnerTexte('archivieren', false, name, seite, intra).titel
    case 'move-mirror':
      return ordnerTexte('verschieben', false, name, seite, intra).titel
  }
}

export function actionDesc(
  action: DirAction,
  seite: Seite,
  c: ConfirmTexte,
  intra: IntraAktionTexte | null
): string {
  switch (action) {
    case 'keep-trunk':
      return c.textBehalten
    case 'keep-mirror':
      return c.textBehaltenMirror
    case 'adopt-mirror':
      return c.textUebernehmen
    case 'adopt-trunk':
      return c.textUebernehmenTrunk
    case 'archive-dir':
      return ordnerTexte('archivieren', true, '', seite, intra).text
    case 'move-dir':
      return ordnerTexte('verschieben', true, '', seite, intra).text
    case 'archive-mirror':
      return ordnerTexte('archivieren', false, '', seite, intra).text
    case 'move-mirror':
      return ordnerTexte('verschieben', false, '', seite, intra).text
  }
}
