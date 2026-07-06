# RaWaLLMConfig

RaWaLLMConfig is a local Electron app for inspecting and editing local LLM,
agent, MCP, hook, and workspace configuration. It is designed for owner-run
desktop use: configuration is visible in one place, edits are gated, and
write operations use backup-first safeguards.

## Status

This repository is being prepared for an AGPL public release. The public
release scope is tracked in `docs/PUBLIC-RELEASE-SCOPE.md`; governance,
session state, local runtime data, private workspace notes, generated output,
and secret-bearing files are excluded from the public source set.

## Features

- Electron + Vite + React desktop app.
- Local-first config dashboard for Claude, Codex, local LLM, MCP, hook, and
  shared workspace surfaces.
- Gated write mode with confirmation and backup-first file writes.
- Local owner config stays directly visible and editable; writes are protected
  by confirmation and backup-first safeguards, and logs avoid secret values.
- File-backed preferences by default, with optional MariaDB support in private
  deployments.

## Development

Install dependencies:

```bash
corepack pnpm install --frozen-lockfile
```

Run checks:

```bash
corepack pnpm typecheck
corepack pnpm test
```

Build the app:

```bash
pnpm build
```

Create a Windows distribution build:

```bash
corepack pnpm dist
```

## Release Notes

The public release is intentionally cut from a fresh, sanitized source set.
Existing private git history is not part of the public release path.

Public Alpha source export:

```bash
corepack pnpm release:notices
corepack pnpm release:export "$env:TEMP/rawallmconfig-public-alpha"
corepack pnpm release:verify "$env:TEMP/rawallmconfig-public-alpha"
```

The exporter is default-deny and only copies the allowlisted public source set
documented in `docs/PUBLIC-RELEASE-SCOPE.md`. Dockerfile-based workflows are
part of the public source set and are verified from a fresh sanitized export.

`docs/THIRD-PARTY-NOTICES.md` is generated from `package.json` and the root
importer section of `pnpm-lock.yaml`. A full transitive SBOM is not generated
for Public Alpha yet; the notices file records that gate explicitly.

## License

RaWaLLMConfig is licensed under the GNU Affero General Public License v3.0 or
later. See `LICENSE`.

External contributions require the RaWaLLMConfig Contributor License Agreement
before merge. See `CONTRIBUTING.md` and `CLA.md`.
