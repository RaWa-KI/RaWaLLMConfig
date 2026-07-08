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

### Für wen ist die Alpha von RaWaLLMConfig gedacht?

Die App richtet sich an alle, die lokale KI-Tools nutzen möchten, ohne sich
durch endlose Konfigurationsdateien, Hooks und Startregeln zu quälen.

- **Der KI-Entdecker (kein IT-Profi):** Du möchtest Claude, Codex oder lokale
  Modelle unkompliziert nutzen? Die App bietet dir eine visuelle Übersicht, die
  dir den Einstieg leicht macht.
- **Der Problemlöser:** Du fragst dich, warum deine KI langsam, teuer oder
  tokenhungrig ist? Die App hilft dir, den Flaschenhals zu verstehen und zu
  beheben.
- **Der Power-User und IT-Profi:** Du brauchst eine zentrale Kommandozentrale?
  Profitiere von komfortablen Übersichten für Diagnosen, Warnungen und
  technische Details.

**Das kann die App bereits:** Wir bündeln deine lokalen Konfigurationen, zeigen
dir Doppelungen auf und übersetzen kryptische Systemzustände in verständliches
Deutsch. Dank integrierter Tipps und passender Befehle kannst du Fehler direkt
nachvollziehen und beheben.

**Wichtiger Hinweis zum Status:** Dies ist eine öffentliche Alpha-Version. Sie
ist perfekt zum Prüfen, Verstehen und Mitgestalten. Wenn du ein zu 100 %
fehlerfreies und fertiges Endprodukt erwartest, solltest du noch auf eine
spätere Version warten.

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

### Who is the RaWaLLMConfig alpha for?

The app is for anyone who wants to use local AI tools without digging through
endless configuration files, hooks, and startup rules.

- **The AI explorer (not an IT professional):** Want to use Claude, Codex, or
  local models more easily? The app gives you a visual overview that makes
  getting started easier.
- **The problem solver:** Wondering why your AI setup feels slow, expensive, or
  token-hungry? The app helps you understand and fix the bottleneck.
- **The power user and IT professional:** Need a central command center? Use
  convenient overviews for diagnostics, warnings, and technical details.

**What the app can already do:** It brings your local configurations together,
points out duplication, and translates cryptic system states into clear
language. Integrated tips and matching commands help you understand and fix
issues directly.

**Important status note:** This is a public alpha. It is ideal for inspection,
understanding, and shaping the product. If you expect a 100% flawless and fully
finished product, you should wait for a later version.

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
