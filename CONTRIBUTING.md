# Contributing to Character UI

Thank you for helping make reusable AI traits easier to inspect, share, and control. Contributions
can include code, tests, documentation, accessibility fixes, design corrections, and declarative
trait catalogs.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security-sensitive
reports belong in the private process described in [SECURITY.md](SECURITY.md), not in a public issue.

## Before you begin

- Search existing issues and pull requests before starting overlapping work.
- Keep one pull request focused on one coherent result.
- Do not add telemetry, provider credentials, executable pack content, or new network services
  without an explicit, reviewed project requirement.
- Do not commit secrets, `.env` files, build output, browser reports, or generated caches.
- For a behavior change, include tests that demonstrate both the intended path and relevant failure
  paths.

## Local setup

Requirements are Node.js 22 or newer and npm 10 or newer.

```sh
cd Character-UI
npm ci
npm run verify
```

Clone your fork with the Git URL shown by GitHub, then run these commands from its parent directory.
The lockfile is the source of truth for dependency installation. Use `npm ci` for a clean checkout
and include an intentional `package-lock.json` change whenever dependencies change.

The browser development server is available with:

```sh
npm run dev
```

It binds to `127.0.0.1:4173`. The local CLI and Electron app require their build steps; see
[README.md](README.md) for exact commands.

## Repository boundaries

- `packages/core` owns the `.charui` schema model, validation, defaults, snapshots, imports, and
  deterministic compiler. It must stay independent of React, Electron, filesystems, and networks.
- `apps/web` owns presentation and browser interaction.
- `packages/cli` owns the loopback HTTP adapter and commands.
- `apps/desktop` owns native dialogs, OS activation, and the narrow Electron bridge.
- `packages/local-storage` owns filesystem persistence shared by the CLI and desktop app.
- `registry/packs` contains declarative community data only.

Preserve the one-way dependency structure in [`docs/architecture.md`](docs/architecture.md). If a
change needs behavior on multiple surfaces, implement the provider-neutral rule in core and keep
each runtime adapter narrow.

## Code changes

1. Create a focused branch from the current default branch.
2. Inspect the relevant package, tests, and local instructions before editing.
3. Make the smallest complete change that satisfies the issue.
4. Add or update deterministic tests.
5. Run focused checks while developing, then the full validation gate once.
6. Review your diff for unrelated files, credentials, generated output, and missing error paths.

Follow the repository formatters and naming conventions. TypeScript should remain explicit and
readable; surface actionable errors instead of silently ignoring invalid input.

Use Conventional Commit subjects when practical, for example:

```text
feat(core): add profile migration validation
fix(cli): reject mismatched loopback origins
docs(registry): clarify catalog license review
```

## Validation

The required pre-pull-request gate is:

```sh
npm run verify
```

It checks formatting, lint, TypeScript, the curated registry, coverage thresholds, and production
builds. For user-interface changes, also install the configured Chrome browser once and run the
end-to-end suite:

```sh
npx playwright install chrome
npm run test:e2e
```

Useful focused commands are listed in [README.md](README.md). Never claim a check passed unless you
ran it against the submitted tree. If a platform-specific check is unavailable, name the exact
blocker and the environment needed to run it.

## Contributing a trait pack

A registry contribution is a single catalog-kind `.charui` document in `registry/packs`. Start from
[`registry/packs/clear-writing.charui`](registry/packs/clear-writing.charui) and validate against
[`schemas/character-ui-v1.schema.json`](schemas/character-ui-v1.schema.json).

Every catalog must have:

- A stable lowercase `catalog.id` containing only letters, numbers, dots, underscores, or hyphens.
- A semantic `catalog.version`; bump it whenever published wording or metadata changes.
- A concise name, description, and author attribution.
- An SPDX-style license identifier and permission to publish every submitted instruction.
- Unique category, trait, and preset IDs with valid category and preset references.
- Provider-neutral, exact system instructions that are useful when read independently.
- An HTTPS `sourceUrl` when that optional field is present.

Catalogs must not contain scripts, templates, commands intended for execution, HTML, secrets,
tracking, remote imports, or provider credentials. A pack is data, not a plugin. Do not submit
copyrighted prompt collections unless their license permits redistribution.

After adding or changing a pack, regenerate—not hand-edit—the index:

```sh
npm run registry:build
npm run registry:validate
```

Commit the resulting `registry/index.json` change with the pack. Reviewers evaluate wording,
license, provenance, duplicate scope, safety, and usefulness in addition to schema validity. A
schema-valid pack is not automatically accepted.

## Changing the `.charui` format

Format changes affect every surface and require more than editing the public JSON Schema. A format
pull request must update, as applicable:

- Core TypeScript types and strict runtime schemas.
- Import, export, snapshot, compiler, and unsupported-version tests.
- `schemas/character-ui-v1.schema.json` or a new versioned schema.
- Example and registry documents.
- CLI, web, and desktop compatibility behavior.
- README and architecture documentation.

Do not change version 1 semantics incompatibly in place. Propose a new schema version and document
migration or rejection behavior.

## Pull requests

Include:

- The user-visible goal and what changed.
- Tests and exact validation commands run.
- Screenshots at desktop and mobile sizes for visible UI changes.
- Security, privacy, persistence, or compatibility implications.
- Known platform-specific validation that remains blocked.
- A linked issue when one exists.

Maintainers may ask for a smaller scope, clearer evidence, licensing proof, or accessibility fixes
before merge. Review comments should address the code and outcome, not the contributor.
