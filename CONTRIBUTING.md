# Contributing to RaWaLLMConfig

Thank you for your interest in RaWaLLMConfig.

RaWaLLMConfig is released as an AGPL-3.0-or-later project. The project owner
also preserves the option to offer commercial support, paid builds, dual
licensing, or other monetized distribution models later.

## Contribution Gate

External code, documentation, design, or asset contributions are accepted only
after the contributor has agreed to the RaWaLLMConfig Contributor License
Agreement (CLA).

Until a CLA workflow is active for a contributor, maintainers may discuss
issues and ideas, but they should not merge pull requests, patches, or copied
implementation text from that contributor.

## Contributor License Agreement

The current CLA policy is documented in `CLA.md`.

By submitting a contribution after accepting the CLA, you confirm that:

- you have the right to submit the contribution;
- the contribution may be distributed under AGPL-3.0-or-later;
- the project owner receives the additional rights described in `CLA.md`,
  including rights needed for future dual licensing or commercial offerings.

## Pull Requests

Before opening a pull request:

- keep the change focused;
- do not include secrets, private paths, local runtime state, dumps, archives,
  or generated build output;
- run the relevant checks when possible:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Branch-to-Release Workflow

Use a focused working branch for each change. Open the pull request from that
branch; the required review and the repository CI workflow must pass before
merge. Merge only the reviewed, sanitized source change into the release
branch. Cut a public release from that sanitized source export after the
release checks pass.

After code, configuration, loader, hook, agent, skill, or workflow changes,
run the narrow `doc-updater` pass for affected existing documentation. It uses
`.claude/docs-code-mapping.json` when present; otherwise the owner supplies a
manual scope. The pass updates only affected docs, does not create a new
workflow document, and does not commit.

Public releases are cut from a sanitized source export. Private workspace
history, governance files, local app data, and session artifacts are not part
of the public source set.
