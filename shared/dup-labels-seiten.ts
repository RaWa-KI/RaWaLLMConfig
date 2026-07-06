// dup-labels-seiten.ts — seite-parametrisierte UI-Texte (Welle 0 Keystone WP-01).
// Ausgelagert aus dup-labels.ts (HR27 ≤300 Z): die paarungs-abhaengigen Label-
// Gruppen sind FUNKTIONEN der Seite/Paarung statt Claude-fester Strings, damit
// Codex- und Mirror-Paare korrekte Texte zeigen. Re-Export laeuft ueber
// dup-labels.ts — bestehende `@shared/dup-labels`-Importpfade bleiben gueltig.
//
// Seiten-Achse heisst im CODE exakt 'claude' | 'codex' | 'workspace' (GENAU wie
// die diffLabels-Signatur). KEIN sichtbarer Achswert 'mirror'. 'workspace' =
// Mirror-im-selben-Tool / generische WS-Kopie -> NEUTRALE Texte (Original /
// zweite Kopie), OHNE Trunk/Mirror/Spiegel-Begriff.
//
// Rueckwaerts-Kompatibilitaet: jede Funktion traegt zusaetzlich die Felder ihres
// Default-Aufrufs (seite='claude') als Properties (Object.assign). So lesen
// bestehende Aufrufer `UEBERNEHMEN.titel` weiter, neue Aufrufer rufen
// `UEBERNEHMEN('codex').titel`. Welle 1 zieht die echte Seite nach.
//
// VERBOTEN in sichtbaren Strings: Trunk, Mirror, Merge, M2, Spiegel,
// „Ordner-Vergleich" als Badge. Code-interne Typnamen bleiben unberuehrt.
// Anker-Konstanten kommen aus dem Leaf-Modul (ARCH-MITTEL-02-Fix): kein Import
// aus ./dup-labels mehr -> der fruehere Wert-Import-Zyklus ist strukturell weg.
import { SEITE, SICHERUNG } from './dup-labels-anker'

export type Seite = 'claude' | 'codex' | 'workspace'

// EINZIGE Quelle der Familie->Seite-Abbildung (Renderer-Pendant zu den
// scan-seitigen Festwerten: claude-scan diffLabels('claude'), codex-scan
// diffLabels('codex'), shared-scan diffLabels('workspace')). Komponenten leiten
// die Seite damit aus dem Familien-Key (ui.llm) ab, statt sie durch viele
// Ebenen zu prop-drillen. Unbekannte/lokale Familien -> 'workspace' (generische
// zentrale-Version-gegen-Kopie, exakt wie shared-scan).
// 'shared' faellt durch auf 'workspace'; dieser Pfad in DuplicatePanel ist nach
// WP-04 (CoverageView ersetzt DuplicatePanel auf Shared) nicht mehr erreichbar.
export function seiteForFamily(family: string): Seite {
  if (family === 'codex') return 'codex'
  if (family === 'claude') return 'claude'
  return 'workspace'
}

// Sprach-Vokabular je Seite: `name` = Name in „X-Version" / „von X nach Shared";
// `kopie` = vollstaendiges Substantiv der lokalen Kopie („Claude-Kopie" /
// „zweite Kopie"); `pfad` = Pfad-Zeile im Confirm; `langAnker` = langer
// Sprach-Anker (SEITE) fuer Wirkungstexte.
interface SeiteVokabular {
  name: string
  kopie: string
  pfad: string
  langAnker: string
}

// Funktion (nicht Map): Zyklus seit Leaf-Extraktion (./dup-labels-anker)
// aufgeloest — die Funktionsform bleibt als stabile API der vok-Aufrufer.
function vok(seite: Seite): SeiteVokabular {
  switch (seite) {
    case 'codex':
      return { name: 'Codex', kopie: 'Codex-Kopie', pfad: 'Codex (lokal)', langAnker: SEITE.codex }
    case 'workspace':
      return { name: 'Original', kopie: 'zweite Kopie', pfad: 'zweite Kopie', langAnker: SEITE.workspace }
    default:
      return { name: 'Claude', kopie: 'Claude-Kopie', pfad: 'Claude (lokal)', langAnker: SEITE.claude }
  }
}

// Aufrufbares Objekt mit Default-Seite 'claude' (Rueckwaerts-Kompatibilitaet):
// `X('codex').feld` (neue Aufrufer) UND `X.feld` (bestehende Aufrufer) gehen.
// Proxy bleibt als Rueckwaerts-Kompat-API; Zyklus seit Leaf-Extraktion aufgeloest.
type SeiteFn<R> = ((seite?: Seite) => R) & R
function mitDefault<R extends object>(fn: (seite?: Seite) => R): SeiteFn<R> {
  return new Proxy(fn, {
    get(target, prop, recv) {
      if (prop in target) return Reflect.get(target, prop, recv)
      return (fn('claude') as Record<PropertyKey, unknown>)[prop]
    }
  }) as SeiteFn<R>
}

// ── Eintrags-/Paar-Aktionen (Quelle → Ziel → Wirkung) ───────────────────────
// Uebernehmen: die <Seite>-Kopie wird zur gemeinsamen Version, die zentrale
// (Shared) wird damit ueberschrieben. Titel nennt Quelle, Richtung und Ziel.
export const UEBERNEHMEN = mitDefault((seite: Seite = 'claude') => ({
  titel: `${vok(seite).kopie} → ersetzt die zentrale Version (Shared)`,
  wirkung: `Die ${vok(seite).kopie} wird zur gemeinsamen Version; die bisherige zentrale (Shared) wird vorher gesichert.`
}))

// Behalten: die zentrale Version (Shared) bleibt; die lokale Kopie wird nur
// archiviert (keine Kopier-Richtung). Titel nennt, was bleibt und was weggeht.
export const BEHALTEN = mitDefault((seite: Seite = 'claude') => ({
  titel: `Zentrale Version (Shared) behalten — ${vok(seite).kopie} archivieren`,
  wirkung: `Die zentrale Version (Shared) bleibt unverändert; die ${vok(seite).kopie} wandert ins Archiv (nicht gelöscht).`
}))

// Spiegel zu BEHALTEN (Finding B): die lokale Kopie BEHALTEN, die zentrale Version
// (Shared) wandert ins Archiv. Bulk-Gegenrichtung (alle keep-mirror).
export const BEHALTEN_MIRROR = mitDefault((seite: Seite = 'claude') => ({
  titel: `${vok(seite).kopie} behalten — zentrale Version (Shared) archivieren`,
  wirkung: `Die ${vok(seite).kopie} bleibt unverändert; die zentrale Version (Shared) wandert ins Archiv (nicht gelöscht).`
}))

// Spiegel zu UEBERNEHMEN (Finding B): die zentrale Version (Shared) ersetzt die
// lokale Kopie; die lokale Kopie wird vorher gesichert und wandert ins Archiv.
export const UEBERNEHMEN_TRUNK = mitDefault((seite: Seite = 'claude') => ({
  titel: `Zentrale Version (Shared) → ersetzt die ${vok(seite).kopie}`,
  wirkung: `Die zentrale Version (Shared) wird zur gemeinsamen Version; die bisherige ${vok(seite).kopie} wird vorher gesichert.`
}))

// ── Pfeil-Tooltips im editierbaren Paar-Diff (v4 §Pfeile, MergeArrows) ───────
// Wortlaut fuer 'claude' 1:1 aus dem v4-Mockup (data-tip): Quelle → Ziel → Wirkung.
export const CHUNK = mitDefault((seite: Seite = 'claude') => ({
  linksTip: `Diesen Absatz von ${vok(seite).name} nach Shared kopieren`,
  rechtsTip: `Diesen Absatz von Shared nach ${vok(seite).name} kopieren`
}))

// ── Bestätigungs-Dialog (Confirm) ───────────────────────────────────────────
// Seiten-neutrale Felder bleiben const; die seiten-nennenden Felder
// (dec<Seite>, pfad<Seite>, titelUebernehmen, textUebernehmen, titelBehalten,
// textBehalten) werden seite-parametrisiert. Feldnamen behalten den Suffix
// „Claude" (code-intern, erlaubt) fuer Rueckwaerts-Kompatibilitaet der Aufrufer.
export const CONFIRM = mitDefault((seite: Seite = 'claude') => {
  const v = vok(seite)
  return {
    abbrechen: 'Abbrechen',
    bestaetigen: 'Bestätigen',
    arbeitet: 'Arbeitet …',
    pfadShared: 'Shared (zentral)',
    pfadClaude: v.pfad,
    proDateiKopf: 'Pro-Datei-Entscheidung',
    proDateiLeer: 'Keine unterschiedlichen Dateien zum Entscheiden.',
    // Pro-Datei-Tasten: symmetrisch (Finding B). decShared/decClaude wie bisher;
    // decClaudeBehalten (keep-mirror) + decSharedUebernehmen (adopt-trunk) spiegeln sie.
    decShared: 'Shared behalten',
    decClaude: `${v.name} übernehmen`,
    decClaudeBehalten: `${v.name} behalten`,
    decSharedUebernehmen: 'Shared übernehmen',
    decSkip: 'Überspringen',
    titelUebernehmen: `${v.name}-Version nach Shared übernehmen?`,
    titelBehalten: `Shared-Version behalten, ${v.kopie} archivieren?`,
    // Spiegel-Titel/-Texte (keep-mirror / adopt-trunk).
    titelBehaltenMirror: `${v.kopie} behalten, Shared-Version archivieren?`,
    titelUebernehmenTrunk: `Shared-Version nach ${v.name} übernehmen?`,
    textUebernehmen: `Die ${v.kopie} ersetzt die zentrale Version (Shared). Vorher wird automatisch eine Sicherung der zentralen Version im Archiv angelegt; die alte Fassung geht nicht verloren.`,
    textBehalten: `Die zentrale Version (Shared) bleibt unverändert. Deine ${v.kopie} wandert ins Archiv (nicht gelöscht).`,
    textBehaltenMirror: `Deine ${v.kopie} bleibt unverändert. Die zentrale Version (Shared) wandert ins Archiv (nicht gelöscht).`,
    textUebernehmenTrunk: `Die zentrale Version (Shared) ersetzt deine ${v.kopie}. Vorher wird automatisch eine Sicherung deiner ${v.kopie} im Archiv angelegt; die alte Fassung geht nicht verloren.`,
    // Kanonisch-bleibt-Umschalter (welche Seite ueberlebt by default).
    kanonFrage: 'Welche Version bleibt?',
    kanonShared: 'Shared',
    kanonClaude: v.name
  }
})

// ── Umbenennen-Inline (v4 §Umbenennen, RenameInline) ────────────────────────
// Seitenwahl: beide / nur Shared / nur <Seite>. Wirkungstext nutzt die langen
// Sprach-Anker (SEITE), die Chips den Kurztext. Felder behalten Suffix „Claude"
// (code-intern) fuer Rueckwaerts-Kompatibilitaet; Werte werden seite-abhaengig.
export const UMBENENNEN = mitDefault((seite: Seite = 'claude') => {
  const v = vok(seite)
  return {
    wirkBeide: `gilt für Shared und ${v.name}`,
    wirkShared: `gilt nur für ${SEITE.shared}`,
    wirkClaude: `gilt nur für ${v.langAnker}`,
    chipBeide: 'beide Seiten',
    chipShared: 'nur Shared',
    chipClaude: `nur ${v.name}`,
    okTip: 'Übernehmen · Sicherung vorher',
    cancelTip: 'Abbrechen — Name bleibt unverändert'
  }
})

// Bestätigungs-Titel/-Text fuer ganze Ordner (statt Trunk-/Spiegel-Ordner).
// seite = welche Seite der Ordner betrifft (Sprach-Anker). 'shared' bleibt die
// zentrale Version; 'claude'|'codex'|'workspace' die jeweilige lokale Kopie.
export function ordnerConfirm(
  art: 'verschieben' | 'archivieren',
  seite: 'shared' | Seite,
  name: string
): { titel: string; text: string } {
  const wo =
    seite === 'shared'
      ? 'die zentrale Version (Shared)'
      : `deine Kopie (${vok(seite).name})`
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

// ── Secret-Paar-Labels (WP-06; Welle 0 legt nur die Keys an) ────────────────
// Laienverstaendliche Texte fuer beidseitig-secret Paare (read-only sichtbar)
// und pro-Datei uebersprungene Secret-Dateien im gemischten Ordner. KEINE
// Secret-WERTE, nur Status + Grund. backup-first/secret-Gates bleiben unberuehrt.
export const SECRET_PAAR = {
  // Badge am Paar-Kopf: enthaelt Zugangsdaten, Werte maskiert (kein Edit-Verbot —
  // Owner darf editieren; Schutz liegt im Reveal-Gate, nicht in einer Sperre).
  badge: 'Enthält Zugangsdaten — Werte maskiert',
  // Zustand einer pro-Datei uebersprungenen Secret-Datei (DirFileRow).
  uebersprungen: 'Enthält Zugangsdaten — übersprungen',
  // Grund-Tooltips (laienverstaendlich, ohne "gesperrt"/"nur ansehen").
  grundAnzeige:
    'Diese Datei enthält Zugangsdaten — Werte werden maskiert angezeigt, Reveal-Gate aktiv.',
  grundUebersprungen:
    'Diese Datei enthält Zugangsdaten — sie wurde übersprungen und bleibt unverändert.',
  // Hinweis bei disabled Aktionen (keine Sperr-Sprache — Aktionen wegen
  // Reveal-Gate pausiert, nicht wegen eines Owner-Verbots).
  aktionGesperrt: 'Diese Datei enthält Zugangsdaten — Werte werden maskiert angezeigt, Reveal-Gate aktiv.',
  // Sichtbarer Sicherungs-Hinweis (keine Tech-Drift). Plain Property: Zyklus
  // seit Leaf-Extraktion (./dup-labels-anker) aufgeloest, kein TDZ-Getter mehr.
  sicherung: SICHERUNG.snapshot
} as const
