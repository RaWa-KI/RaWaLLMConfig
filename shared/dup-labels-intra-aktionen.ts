// dup-labels-intra-aktionen.ts — ehrliche AKTIONS-Texte fuer Duplikate
// INNERHALB einer Familie (Folge-WP zum Owner-Befund P1 2026-08-07): die
// Reconcile-Knoepfe und Confirm-Dialoge sprachen bei Intra-Familien-Paaren
// weiter von „Shared"/„zentrale Version"/„deine Kopie" — Shared ist an diesen
// Paaren nicht beteiligt. Hier stehen die Fundstellen-/Fassungs-Pendants zu
// UEBERNEHMEN/BEHALTEN(_MIRROR)/UEBERNEHMEN_TRUNK/CONFIRM/ordnerConfirm/
// SPEICHERN/CHUNK/SEITE_KURZ. Cross-Root-Paare behalten die Bestandstexte
// zeichengenau (Regression-Pin in tests/write/dup-labels-intra.spec.ts).
// Leaf-Modul: importiert nur ./dup-labels-intra — Re-Export via dup-labels.ts.
// Reine Texte: Merge-, Backup-, Confirm-Flow und Aktions-VERHALTEN unveraendert.
import { FUNDSTELLE, unterscheidendeAbschnitte } from './dup-labels-intra'

// Kurzform „Fassung „x"" fuer Knoepfe/Chips/Saetze.
export function fassungsName(kurz: string): string {
  return `Fassung „${kurz}"`
}

interface IntraAktion {
  titel: string
  wirkung: string
}

// Paar-Aktionen + Confirm-Texte eines Intra-Familien-Paars. `fassungen` =
// [Fundstelle A (trunk-Seite), Fundstelle B (mirror-Seite)] — Kurznamen aus
// unterscheidendeAbschnitte. confirm ist feldkompatibel zu CONFIRM(seite),
// damit bestehende Confirm-Komponenten nur das Textobjekt tauschen.
export interface IntraAktionTexte {
  fassungen: [string, string]
  uebernehmen: IntraAktion // adopt-mirror: B ersetzt A
  uebernehmenTrunk: IntraAktion // adopt-trunk: A ersetzt B
  behalten: IntraAktion // keep-trunk: A bleibt, B ins Archiv
  behaltenMirror: IntraAktion // keep-mirror: B bleibt, A ins Archiv
  confirm: ReturnType<typeof intraConfirm>
}

// Bequemer Einstieg direkt aus den beiden Member-Pfaden (DuplicateSet).
export function intraAktionTexte(pfadA: string, pfadB: string): IntraAktionTexte {
  return intraAktionTexteAusFassungen(unterscheidendeAbschnitte(pfadA, pfadB))
}

// Kernaufbau aus fertigen Fassungs-Kurznamen (z. B. aus intraFassungenAusLabels).
export function intraAktionTexteAusFassungen(fassungen: [string, string]): IntraAktionTexte {
  const fa = fassungsName(fassungen[0])
  const fb = fassungsName(fassungen[1])
  return {
    fassungen,
    uebernehmen: {
      titel: `${fb} → ersetzt ${fa}`,
      wirkung: `Der Inhalt von ${fb} ersetzt ${fa}; die bisherige ${fa} wird vorher gesichert.`
    },
    uebernehmenTrunk: {
      titel: `${fa} → ersetzt ${fb}`,
      wirkung: `Der Inhalt von ${fa} ersetzt ${fb}; die bisherige ${fb} wird vorher gesichert.`
    },
    behalten: {
      titel: `${fa} behalten — ${fb} archivieren`,
      wirkung: `${fa} bleibt unverändert; ${fb} wandert ins Archiv (nicht gelöscht).`
    },
    behaltenMirror: {
      titel: `${fb} behalten — ${fa} archivieren`,
      wirkung: `${fb} bleibt unverändert; ${fa} wandert ins Archiv (nicht gelöscht).`
    },
    confirm: intraConfirm(fassungen)
  }
}

// Confirm-Texte (feldkompatibel zu CONFIRM(seite), alle Felder string): die
// Shared-/Kopie-nennenden Felder tragen Fundstellen-/Fassungs-Sprache; die
// code-internen Feldnamen (…Shared/…Claude) bleiben als stabile API unberuehrt
// (pfadShared/decShared = Fundstelle A, pfadClaude/decClaude = Fundstelle B).
function intraConfirm(fassungen: [string, string]) {
  const fa = fassungsName(fassungen[0])
  const fb = fassungsName(fassungen[1])
  return {
    abbrechen: 'Abbrechen',
    bestaetigen: 'Bestätigen',
    arbeitet: 'Arbeitet …',
    pfadShared: FUNDSTELLE.a,
    pfadClaude: FUNDSTELLE.b,
    proDateiKopf: 'Pro-Datei-Entscheidung',
    proDateiLeer: 'Keine unterschiedlichen Dateien zum Entscheiden.',
    decShared: `${fa} behalten`,
    decClaude: `${fb} übernehmen`,
    decClaudeBehalten: `${fb} behalten`,
    decSharedUebernehmen: `${fa} übernehmen`,
    decSkip: 'Überspringen',
    titelUebernehmen: `${fb} übernehmen — ersetzt ${fa}?`,
    titelBehalten: `${fa} behalten, ${fb} archivieren?`,
    titelBehaltenMirror: `${fb} behalten, ${fa} archivieren?`,
    titelUebernehmenTrunk: `${fa} übernehmen — ersetzt ${fb}?`,
    textUebernehmen: `${fb} ersetzt ${fa}. Vorher wird automatisch eine Sicherung von ${fa} im Archiv angelegt; die alte Fassung geht nicht verloren.`,
    textBehalten: `${fa} bleibt unverändert. ${fb} wandert ins Archiv (nicht gelöscht).`,
    textBehaltenMirror: `${fb} bleibt unverändert. ${fa} wandert ins Archiv (nicht gelöscht).`,
    textUebernehmenTrunk: `${fa} ersetzt ${fb}. Vorher wird automatisch eine Sicherung von ${fb} im Archiv angelegt; die alte Fassung geht nicht verloren.`,
    kanonFrage: 'Welche Fassung bleibt?',
    kanonShared: fa,
    kanonClaude: fb
  }
}

// Ganz-Ordner-Confirm eines Intra-Paars (Pendant zu ordnerConfirm): seite 'a' =
// Fundstelle A (trunk-Seite), 'b' = Fundstelle B (mirror-Seite).
export function intraOrdnerConfirm(
  art: 'verschieben' | 'archivieren',
  seite: 'a' | 'b',
  name: string,
  fassungen: [string, string]
): { titel: string; text: string } {
  const wo = fassungsName(seite === 'a' ? fassungen[0] : fassungen[1])
  if (art === 'archivieren') {
    return {
      titel: `Ganzen Ordner archivieren? (${name})`,
      text: `Der Ordner „${name}" — ${wo} — wandert komplett ins Archiv (nicht gelöscht). Kein Datenverlust.`
    }
  }
  return {
    titel: `Ganzen Ordner verschieben? (${name})`,
    text: `Der Ordner „${name}" — ${wo} — wird an den gewählten Zielpfad verschoben. Sicherung vorher.`
  }
}

// Speichern-Knoepfe des Paar-Editors (Pendant zu SPEICHERN.inShared /
// speichernInKopie): a = linke Seite (Fundstelle A), b = rechte (Fundstelle B).
export function intraSpeichern(fassungen: [string, string]): { inA: string; inB: string } {
  return {
    inA: `In ${fassungsName(fassungen[0])} speichern`,
    inB: `In ${fassungsName(fassungen[1])} speichern`
  }
}

// Pfeil-Tooltips der Chunk-Uebernahme (Pendant zu CHUNK): ← kopiert von der
// rechten Fundstelle B in die linke Fundstelle A, → umgekehrt.
export function intraChunk(fassungen: [string, string]): { linksTip: string; rechtsTip: string } {
  const fa = fassungsName(fassungen[0])
  const fb = fassungsName(fassungen[1])
  return {
    linksTip: `Diesen Absatz von ${fb} nach ${fa} kopieren`,
    rechtsTip: `Diesen Absatz von ${fa} nach ${fb} kopieren`
  }
}

// Kurz-Anker fuer die Versions-Wahl im Verschieben-Dialog (Pendant zu
// SEITE_KURZ): a/b = die beiden Fundstellen, beide = beide Fassungen.
export function intraSeiteKurz(fassungen: [string, string]): { a: string; b: string; beide: string } {
  return {
    a: fassungsName(fassungen[0]),
    b: fassungsName(fassungen[1]),
    beide: 'Beide Fassungen'
  }
}
