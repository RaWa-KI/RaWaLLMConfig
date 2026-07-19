---
type: public-release-scope
status: draft
created: 2026-07-03
updated: 2026-07-16
plan: PLAN-rawallmconfig-oss-teil-a-cleanup-lizenz_2026-06-16
snapshot: private archive snapshot 2026-07-03-oss-teil-a-a0-presnapshot
secret_review: no-secrets
---

# Public Release Scope

Dieses Dokument grenzt den Quellumfang fuer das frische, PII-freie Public-Repo ab. Es ist Teil von
OSS Teil A / A-0 und ersetzt keine PII-Pruefung: A-1 und A-Z muessen den uebernommenen Kern erneut
scannen.

## Snapshot

Vor dieser Scope-Datei wurde ein Pre-Snapshot angelegt:

- private archive snapshot `2026-07-03-oss-teil-a-a0-presnapshot/rawallmconfig-head-tracked.zip`
- private archive snapshot `2026-07-03-oss-teil-a-a0-presnapshot/git-status-before-a0.txt`
- private archive snapshot `2026-07-03-oss-teil-a-a0-presnapshot/working-tree-diff-before-a0.patch`
- private archive snapshot `2026-07-03-oss-teil-a-a0-presnapshot/ARCHIV-INDEX.md`

## Include

Diese Klassen gehoeren in das frische Public-Repo, sofern A-1/A-Z PII-frei bleiben:

- App-Quellen: `src/**`
- Shared Contracts und Hilfen: `shared/**`
- Tests und Fixtures, soweit public-tauglich: `tests/write/**`
- Build- und Hilfsskripte, gezielt public-tauglich:
  `scripts/release/**`, `scripts/generate-update-manifest.mjs`,
  `scripts/install-git-hooks.mjs`, `scripts/git-hooks/pre-commit`
- Electron/Vite/TypeScript-Konfiguration: `electron.vite.config.ts`, `tsconfig.json`
- Paket- und Installationsmetadaten: `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `.npmrc`, `.gitignore`
- Lizenz- und Hinweisdateien: `LICENSE`, `NOTICE`, `README.md`,
  `CONTRIBUTING.md`, `CLA.md`, `docs/PUBLIC-RELEASE-SCOPE.md`,
  `docs/THIRD-PARTY-NOTICES.md`
- GitHub-Community-Dateien: `.github/pull_request_template.md`
- Packaging-Basis, sofern ohne private Targets: `electron-builder.yml`
- Public-Docker-Build-Artefakte: `Dockerfile`, `.dockerignore`
- App-Assets und Brand-Material, sofern frei von Owner-/Host-Daten:
  `build/icon.ico`, `docs/brand/**`

## Exclude

Diese Klassen werden nicht in das frische Public-Repo uebernommen:

- Governance, Session- und Agentenlaufzeit: `.claude/**`, `.agents/**`, `.codex/**`
- lokale Appdaten und Audit-Runtime: `.rawallmconfig/**`, `.remember/**`, `.playwright-mcp/**`
- interne historische Designpakete, Prototypen und Import-Artefakte
- Projektinterne Steuerdokumente: `AGENTS.md`, `CLAUDE.md`, `MODULAR-DEBT.md`, `ZIELE.md`
- Build- und Cache-Ausgaben: `node_modules/**`, `out/**`, `dist/**`, `dist-release/**`, `.vite/**`
- Test-/Design-/Graph-Ausgaben: `tests/audit-runtime/**`, `test-results/**`,
  `playwright-report/**`, `design-export/**`, `graphify-out/**`, `*.zip`
- lokale Secrets, Dumps und Produktionsconfigs: Environment-Dateien, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.sql`,
  `*.sqlite*`, `*.db`, `config.php`, `wp-config.php`
- private Vendor-Closures und Paketspiegel aus internen Workspaces.
- Private lokale Pfade und History: Git-Metadaten, Owner-Home-Pfade,
  private Archivlaufwerke, File-/Link-Protokollpfade und lokale Git-File-Pins.

## Mechanik PRR-1/PRR-3/PRR-10

- Export: `corepack pnpm release:export "<ziel-ausserhalb-des-repos>"`.
  Das Ziel muss ausserhalb des Repos liegen und leer sein.
- Verify: `corepack pnpm release:verify "<export-ziel>"`. Das Gate prueft
  Allowlist, verbotene Pfade, Archive/Binaries, private Pfade, File-/Link-Protokollpfade,
  lokale Git-File-Pins, private caudex-Paket-/Vendor-Hinweise und grobe
  Secret-Patterns ohne Werte auszugeben. Dummy-Fixtures mit `DUMMY` im Testcode
  sind erlaubt, damit Secret-Guard-Tests public pruefbar bleiben.
- Third-party Notices: `corepack pnpm release:notices` erzeugt
  `docs/THIRD-PARTY-NOTICES.md` aus `package.json` und dem Root-Importer in
  `pnpm-lock.yaml`. Vollstaendiges transitive SBOM: `n-a`, noch kein
  dediziertes SBOM-Tool im Public-Alpha-Gate.
- Contributor-Gate: AGPL-3.0-or-later bleibt Public-License; externe
  Contributions erfordern vor Merge eine CLA-Policy (`CONTRIBUTING.md`,
  `CLA.md`, PR-Template). Ein reiner DCO reicht fuer spaetere Dual-License-/
  Monetarisierungsoptionen nicht als Projektdefault.

## Docker-Gate

- Public-Docker-Slice: Dockerfile/.dockerignore sind ohne private Vendor-,
  `file:`- oder `git+file:`-Closure geschnitten und in der Export-Allowlist.
  PRR-Docker ist per `docker build` aus frischem Export zu belegen; Stand
  2026-07-06: PASS.

## Nach A-0 Noch Offen

- A-1: PII-/Owner-Pfad-Inventar ueber `src/**`, `tests/**`, `scripts/**`, `shared/**`.
- A-2/A-3: Code- und `sys-scan`-Tilgung nur gegen A-1-Befund.
- A-5/A-6: caudex-Entkopplung bleibt getrennt; Dependency-/Lockfile-Touch ist PM/caudex-Gate.
- A-Z: Re-Sweep muss 0 public-blockierende Treffer im uebernommenen Kern zeigen.
