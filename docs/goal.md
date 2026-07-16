# Character UI v1

## Goal

Deliver an open-source, local-first GUI that lets people assemble consistent AI system instructions from reusable traits, presets, imported packs, and personal traits. The same deterministic `.charui` data and compiler must work in the public website, local npm UI/CLI, and installable desktop application.

## Hard Stop Rule

Stop when the acceptance criteria and required validation below pass, or when a named external/admin blocker is the only remaining work. Do not invent unrelated features after that point.

## Source Evidence

- `design-concepts/01-split-workbench.png`: accepted three-panel layout.
- `design-concepts/03-editorial-trait-library.png`: accepted warm editorial styling.
- `design-concepts/02-dark-focus-console.png`: accepted dense instruction/detail treatment.
- User requirements: checklist traits, defaults, presets, personal traits, text and JSON import, JSON export, local persistence, npm installation, website downloads, and a custom file type handled by the desktop app.

## Primary Defects / Requirements

- The repository began without application code, package metadata, tests, or deployment configuration.
- Define one versioned schema and deterministic compiler shared across all surfaces.
- Provide a usable trait/profile builder with real persistence and non-inert controls.
- Support safe `.charui`, JSON, and deterministic text imports with preview/confirmation.
- Provide a local npm CLI/UI and an installable Electron desktop app.
- Register `.charui` and `characterui:` in packaged desktop builds without associating all `.json` files.
- Provide a curated, Git-backed community pack registry and free static website deployment.

## Non-Goals

- Calling an AI provider or storing provider credentials.
- Cloud accounts, synchronization, ratings, comments, or arbitrary remote pack execution.
- AI interpretation of arbitrary prose, executable templates, scripts, or plugins inside packs.
- Enabling an ad network without the owner-supplied publisher and slot identifiers.
- Claiming signed/notarized desktop releases without external signing credentials.

## Implementation Order

1. Core schema, validation, defaults, persistence types, compiler, and tests.
2. React studio matching the accepted hybrid design.
3. Local npm CLI/server and shared local storage adapter.
4. Secure Electron shell, file/protocol handling, and packaging.
5. Registry validation, contribution docs, CI, Pages deployment, and optional ad adapter.
6. Full validation, browser fidelity loop, packaging proof, and skeptical review.

## Acceptance Criteria

- A new user sees a useful default profile and can toggle, search, pin, add, edit, archive, and restore traits.
- Presets update the profile and the compiled prompt changes immediately.
- Profiles can be created, renamed, selected, exported, and imported without losing trait snapshots.
- `.charui`/JSON and documented text imports are validated and previewed before installation; invalid or oversized input is rejected with an actionable message.
- Compiler output is byte-deterministic across core, web, CLI, and desktop consumers.
- The website can download catalogs and profiles as `.charui`; generic JSON export remains available but is never registered as an OS-wide association.
- `character-ui serve`, `character-ui validate`, `character-ui compile`, and `character-ui defaults` work from the built npm package.
- Desktop state persists locally, packaged builds register `.charui` and `characterui:`, and renderer privileges remain narrowly bridged.
- The public registry is schema/license/hash validated in CI and the web build is deployable to GitHub Pages.
- The approved hybrid design works at desktop and mobile sizes with keyboard focus and accessible labels.

## Required Validation

- Formatting, lint, TypeScript typecheck, registry validation, unit/integration tests, and coverage.
- Production builds for core, web, CLI, and desktop.
- CLI package smoke test from `npm pack` output.
- Electron unpacked/Windows installer packaging proof when local tooling permits.
- Browser page identity, nonblank/error-overlay, console, interaction, accessibility, desktop/mobile, and screenshot checks.
- Negative tests for malformed/oversized imports, unsafe paths, hostile hosts/origins, navigation, IPC arguments, and unsupported schema versions.
- Two independent skeptical reviewers after implementation changes.

## Known External Blockers

- Live ads require publisher configuration and any consent/policy steps required by the selected ad network.
- Release signing/notarization requires platform credentials and, on macOS, Apple-controlled tooling.

## Success Output Format

Report the completed goal state, user-visible changes, exact validation commands/evidence, remaining external blockers, and final summary.

## Failure Output Format

Report completed work, failed item, exact blocker, unlock condition, validation evidence, remaining blockers, and final summary.
