# RaWaLLMConfig

RaWaLLMConfig is a local desktop app for inspecting and safely managing AI
tool configuration. Deutsche Informationen stehen zuerst; an English summary
follows below.

## Bildschirmfotos

Ein aktuelles Bild der Startseite folgt erst nach dem High-Fidelity-Nachweis
eines frisch gebauten und installierten Pakets.

![Modulkonfiguration](docs/brand/app-config-modules.png)

![Änderungsansicht](docs/brand/model-config-edit-simple-mode.png)

![Toolchain-Watcher](docs/brand/toolchain-watcher.png)

## Deutsch

RaWaLLMConfig macht lokale Konfigurationen für Claude, Codex, MCP, Hooks,
Agenten und lokale Modelle an einem Ort sichtbar. Die App arbeitet lokal.
Schreibaktionen brauchen eine Bestätigung und legen zuerst eine Sicherung an.

Die App ist eine öffentliche Alpha. Der Kern ist nutzbar, einzelne Ansichten
und Integrationen werden noch vereinfacht und vervollständigt.

### Enthaltene Funktionen

- Übersicht über erkannte Konfigurationsquellen und wichtige Zustände.
- Geführte Einstiege für Prüfung, Vergleich und sichere Änderungen.
- Geschützter Schreibmodus mit Bestätigung und Backup-first-Logik.
- Toolchain-Watcher für lokale Versionen und Wartungshinweise.
- Plattformbezogene Auswahl passender Update-Pakete.
- Node-basierte Service-Tests für zentrale App-Flows.

### Downloads und Updates nach Betriebssystem

Windows- und Linux-Pakete sind getrennte Erstdownloads. Verwende immer das
Paket für dein Betriebssystem.

#### Windows

Der derzeit geprüfte Endnutzer-Download ist der Windows-Installer auf der
[GitHub-Releases-Seite][releases]. Er trägt das Namensmuster
`RaWaLLMConfig-Setup-x.y.z.exe` und wird als NSIS-Installer ausgeführt.

Der In-App-Updater wählt für Windows das passende `.exe`-Paket aus dem
Release. Windows SmartScreen kann bei einer noch unsignierten Alpha einen
Hinweis anzeigen. Der jeweilige Release stellt Prüfsummen bereit.

#### Linux

Die Build-Konfiguration enthält getrennte Ziele für AppImage, deb und rpm.
Der vollständige Paket- und Startbeweis auf einem nativen Linux-Runner steht
für die aktuelle Alpha noch aus. Ein Linux-Download gilt deshalb erst dann als
verfügbar, wenn die passenden Dateien im jeweiligen Release veröffentlicht
und dort als geprüft ausgewiesen sind.

- **AppImage:** Das AppImage ist der portable Erstdownload. Wird die App als
  AppImage gestartet, ist der In-App-Updater für den gesicherten Austausch
  genau dieser AppImage-Datei vorgesehen.
- **deb/rpm:** Diese Pakete werden über den Paketmanager installiert. Es gibt
  derzeit kein eigenes apt-/dnf-Paket-Repository. Eine neue Version wird daher
  manuell als neues deb-/rpm-Paket über den Paketmanager installiert; der
  In-App-Updater ersetzt keine paketverwaltete Installation.

### Toolchain-Watcher

Claude Code, Codex, MCPs und lokale Modelle ändern sich regelmäßig. Der
Watcher verbindet lokal erfasste Versions- und Changelog-Hinweise mit der
vorhandenen Konfiguration. Er zeigt Hinweise an, führt aber keine stillen
Installationen oder Reparaturen aus.

Für Claude Code gilt der native Standalone-Pfad als Projektvorgabe; npm gehört
nicht zum unterstützten Betriebsweg. Der Versionscheck über `claude --version`
bestätigt nur die erreichbare Version; er weist weder den Installationspfad
noch den Installationsursprung nach.

### Noch nicht vollständig

- Import eigener Sprachdateien.
- Vollständige Vorlagenverwaltung.
- Einfach-/Expertenmodus in jeder Ansicht.
- Datenbank-Unterstützung als Standardpfad für normale Nutzer.
- Vollständige Linux-CI mit Paket- und Startbeweis.

### Entwicklung und Prüfung

Voraussetzung ist Node.js 22 oder neuer mit Corepack.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

### Build-Matrix

- `corepack pnpm dist:win` baut den Windows-NSIS-Installer.
- `corepack pnpm dist:linux` baut AppImage, deb und rpm.
- `corepack pnpm dist:all` startet beide konfigurierten Build-Ziele.

Für Release-Beweise sollen Windows- und Linux-Pakete auf dem jeweiligen
nativen Betriebssystem oder in einer entsprechenden CI-Matrix gebaut und
gestartet werden. Ein erfolgreicher Quell-Build ersetzt diesen Paketbeweis
nicht.

### Öffentlicher Quell-Export

Der öffentliche Quellstand wird aus einem frischen, leeren Ziel außerhalb des
Repositories erzeugt und anschließend geprüft:

```bash
corepack pnpm release:notices
corepack pnpm release:export "../rawallmconfig-public-alpha"
corepack pnpm release:verify "../rawallmconfig-public-alpha"
```

Der Exportumfang steht in
[`docs/PUBLIC-RELEASE-SCOPE.md`](docs/PUBLIC-RELEASE-SCOPE.md).

### Lizenz und Beiträge

Der Quellcode steht unter AGPL-3.0-or-later. Externe Beiträge benötigen vor
dem Merge eine Contributor License Agreement. Details stehen in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## English

RaWaLLMConfig brings local configuration for Claude, Codex, MCP, hooks,
agents, and local models into one desktop app. It runs locally. Write actions
require confirmation and create a backup before changing files.

The app is a public alpha. Its core is usable, while some views and
integrations are still being simplified and completed.

### Included features

- An overview of detected configuration sources and important states.
- Guided entry points for inspection, comparison, and safe changes.
- Protected write mode with confirmation and backup-first safeguards.
- A toolchain watcher for local versions and maintenance notices.
- Platform-aware selection of matching update packages.
- Node-based service tests for central app flows.

### Downloads and updates by operating system

Windows and Linux packages are separate first downloads. Always choose the
package built for your operating system.

#### Windows download

The currently verified end-user download is the Windows installer on the
[GitHub Releases page][releases]. Its name follows the pattern
`RaWaLLMConfig-Setup-x.y.z.exe`, and it runs as an NSIS installer.

On Windows, the in-app updater selects the matching `.exe` asset from the
release. Windows SmartScreen may show a notice for an unsigned alpha. Each
release provides checksums for verification.

#### Linux downloads

The build configuration contains separate AppImage, deb, and rpm targets.
Complete package and launch evidence from a native Linux runner is still
pending for the current alpha. A Linux download is therefore considered
available only when the matching files are published in a release and marked
there as verified.

- **AppImage:** The AppImage is the portable first download. When the app is
  launched as an AppImage, the in-app updater is intended to replace that
  AppImage file after creating a backup.
- **deb/rpm:** These packages are installed through the package manager. The
  project does not currently provide its own apt or dnf repository. Later
  versions must therefore be installed manually as a new deb or rpm package;
  the in-app updater does not replace a package-managed installation.

### Toolchain watcher

Claude Code, Codex, MCPs, and local models change regularly. The watcher
connects locally collected version and changelog notices with the detected
configuration. It shows notices but does not perform silent installations or
repairs.

For Claude Code, the native standalone path is the project standard; npm is
outside the supported operating path. The `claude --version` check confirms
only the reachable version; it proves neither the installation path nor its
origin.

### Not yet complete

- Importing custom language files.
- Complete template management.
- Simple/Expert mode in every view.
- Database support as the default path for regular users.
- Complete Linux CI with package and launch evidence.

### Development and verification

Node.js 22 or newer with Corepack is required.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

### Build matrix

- `corepack pnpm dist:win` builds the Windows NSIS installer.
- `corepack pnpm dist:linux` builds AppImage, deb, and rpm packages.
- `corepack pnpm dist:all` starts both configured build targets.

For release evidence, Windows and Linux packages should be built and launched
on the matching native operating system or CI matrix. A successful source
build does not replace package-level evidence.

### Public source export

The public source set is created in a fresh, empty target outside the
repository and verified afterwards:

```bash
corepack pnpm release:notices
corepack pnpm release:export "../rawallmconfig-public-alpha"
corepack pnpm release:verify "../rawallmconfig-public-alpha"
```

The export scope is documented in
[`docs/PUBLIC-RELEASE-SCOPE.md`](docs/PUBLIC-RELEASE-SCOPE.md).

### License and contributions

The source code is licensed under AGPL-3.0-or-later. External contributions
require a Contributor License Agreement before merge. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

[releases]: https://github.com/RaWa-KI/RaWaLLMConfig/releases/latest
