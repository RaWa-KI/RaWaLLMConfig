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

Public releases are cut from a sanitized source export. Private workspace
history, governance files, local app data, and session artifacts are not part
of the public source set.
