# RaWaLLMConfig

## Deutsch

RaWaLLMConfig ist eine lokale Desktop-App, mit der KI-Tool-Konfigurationen an
einem Ort sichtbar werden: Claude, Codex, MCP, Hooks, lokale Modelle, Agenten
und Workspace-Einstellungen.

Die App richtet sich an Menschen, die ihre lokale KI-Arbeitsumgebung besser
verstehen, prüfen und sicher verwalten möchten. Sie läuft lokal auf dem eigenen
Rechner. Schreibaktionen sind geschützt: Änderungen brauchen Bestätigung und
werden backup-first ausgeführt.

RaWaLLMConfig ist aktuell eine öffentliche Alpha. Das bedeutet: Der Kern ist
nutzbar, einzelne Bereiche werden aber noch erweitert, geglättet und
verständlicher gemacht.

Der öffentliche Quellcode steht unter AGPL-3.0-or-later. Externe Beiträge
brauchen vor dem Merge eine Contributor License Agreement.

### Was aktuell enthalten ist

- Übersicht über erkannte KI- und Tool-Konfigurationen.
- Unterstützung für Claude-, Codex-, MCP-, Hook- und lokale Modell-Quellen.
- Lokale Anzeige wichtiger Konfigurationspfade und Zustände.
- Geführte Einstiege für typische Prüf- und Verwaltungsaufgaben.
- Geschützter Schreibmodus mit Bestätigung und Backup-first-Logik.
- Update-Unterstützung über öffentliche GitHub-Releases.
- Tests und Smokes für zentrale App-Flows.

### Noch nicht vollständig enthalten

Einige geplante Bereiche sind noch nicht fertig oder noch nicht für normale
Nutzer freigegeben:

- die App soll später eigene Sprachdateien laden können; dieser Import ist noch
  nicht fertig,
- vollständige Vorlagen-/Template-Verwaltung,
- der Einfach-/Expertenmodus ist noch nicht in allen Ansichten vollständig
  umgesetzt,
- Datenbank-Unterstützung ist vorbereitet, aber noch kein fertiger Standardpfad
  für normale Nutzer,
- alle geplanten Integrationen für weitere lokale Tool-Familien,
- ein komplett geglätteter Nicht-Technik-Modus für alle Ansichten,
- vollständige Dokumentation für jede Einstellung und jeden Spezialfall.

Diese Punkte sind bewusst nicht als fertige Funktionen beschrieben. Sie werden
Schritt für Schritt ergänzt.

### Für wen ist die Alpha gedacht?

RaWaLLMConfig ist für Menschen gedacht, die mit lokalen KI-Tools arbeiten
möchten, ohne erst alle Konfigurationsdateien, Hooks, MCPs, Modelle und
Startregeln von Hand suchen zu müssen.

Besonders hilfreich ist die Alpha für:

- Menschen, die Claude, Codex, MCPs oder lokale Modelle nutzen möchten, aber
  keine IT- oder Admin-Oberfläche im Kopf haben.
- Menschen, die verstehen wollen, warum ihre KI-Umgebung langsam, teuer,
  unübersichtlich oder tokenhungrig wirkt.
- Fortgeschrittene Nutzer und ITler, die eine visuelle Oberfläche für
  Konfigurationen, Diagnosen, Warnungen und technische Details möchten.

Die App zeigt lokale Konfigurationen gesammelt an, weist auf mögliche
Doppelungen oder Fehlkonfigurationen hin und erklärt viele technische Zustände
verständlicher. Einige Bereiche enthalten bereits Tipps, Hinweise und passende
Befehle, damit Probleme nicht nur sichtbar werden, sondern auch nachvollziehbar
bleiben.

Wenn du einfach nur eine vollständig fertige Endnutzer-App erwartest, ist eine
spätere Version wahrscheinlich besser geeignet. Diese Version ist eine
öffentliche Alpha: nützlich zum Prüfen, Verstehen und Rückmelden, aber noch
nicht in allen Bereichen fertig poliert.

### Entwicklung

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Windows-Build:

```bash
corepack pnpm dist
```

### Public-Alpha-Export

Der öffentliche Quellstand wird bewusst aus einem frischen, bereinigten Export
geschnitten. Private Git-Historie, Governance-Dateien, lokale Laufzeitdaten,
generierte Ausgaben und Dateien mit Secret-Risiko gehören nicht in den
öffentlichen Quellstand.

```bash
corepack pnpm release:notices
corepack pnpm release:export "$env:TEMP/rawallmconfig-public-alpha"
corepack pnpm release:verify "$env:TEMP/rawallmconfig-public-alpha"
```

Der Exportumfang ist in `docs/PUBLIC-RELEASE-SCOPE.md` beschrieben.

### Lizenz

RaWaLLMConfig steht unter der GNU Affero General Public License v3.0 or later.
Externe Beiträge benötigen vor dem Merge die RaWaLLMConfig Contributor License
Agreement.

## English

RaWaLLMConfig is a local desktop app for making AI tool configuration visible in
one place: Claude, Codex, MCP, hooks, local models, agents, and workspace
settings.

The app is built for people who want to understand, inspect, and safely manage
their local AI working environment. It runs locally on the user's machine. Write
actions are protected: changes require confirmation and use backup-first
safeguards.

RaWaLLMConfig is currently a public alpha. This means the core is usable, while
some areas are still being expanded, refined, and made easier to understand.

The public source code is licensed under AGPL-3.0-or-later. External
contributions require a Contributor License Agreement before merge.

### What is included now

- Overview of detected AI and tool configuration sources.
- Support for Claude, Codex, MCP, hook, and local model configuration surfaces.
- Local display of important configuration paths and states.
- Guided entry points for common inspection and management tasks.
- Protected write mode with confirmation and backup-first behavior.
- Update support through public GitHub releases.
- Tests and smokes for central app flows.

### Not fully included yet

Some planned areas are not finished yet or are not ready for regular users:

- the app is intended to load custom language files later; this import flow is
  not finished yet,
- full template management,
- the Simple/Expert mode switch is not fully implemented across all views yet,
- database support is prepared, but not yet a finished default path for regular
  users,
- all planned integrations for additional local tool families,
- a fully polished non-technical mode across all views,
- complete documentation for every setting and special case.

These points are intentionally not described as finished features. They will be
added step by step.

### Who is this alpha for?

RaWaLLMConfig is for people who want to work with local AI tools without first
having to find every configuration file, hook, MCP, model, and startup rule by
hand.

The alpha is especially useful for:

- people who want to use Claude, Codex, MCPs, or local models without thinking
  in IT or admin interfaces,
- people who want to understand why their AI environment feels slow, expensive,
  hard to follow, or token-hungry,
- advanced users and IT professionals who want a visual interface for
  configurations, diagnostics, warnings, and technical details.

The app brings local configuration surfaces into one place, points out possible
duplication or misconfiguration, and explains many technical states in clearer
language. Some areas already include tips, hints, and useful commands so that
problems are not only visible, but also easier to understand.

If you expect a fully finished end-user app, a later version will probably be a
better fit. This version is a public alpha: useful for inspection,
understanding, and feedback, but not fully polished in every area yet.

### Development

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Windows build:

```bash
corepack pnpm dist
```

### Public Alpha Export

The public source set is intentionally cut from a fresh, sanitized export.
Private git history, governance files, local runtime data, generated output, and
secret-risk files are not part of the public source set.

```bash
corepack pnpm release:notices
corepack pnpm release:export "$env:TEMP/rawallmconfig-public-alpha"
corepack pnpm release:verify "$env:TEMP/rawallmconfig-public-alpha"
```

The export scope is documented in `docs/PUBLIC-RELEASE-SCOPE.md`.

### License

RaWaLLMConfig is licensed under the GNU Affero General Public License v3.0 or
later. External contributions require the RaWaLLMConfig Contributor License
Agreement before merge.
