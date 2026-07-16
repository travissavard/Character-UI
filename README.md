# Character UI

Character UI is a local-first studio for assembling reusable AI system instructions from
checklist traits. Start with the built-in library or a preset, add personal traits, inspect the
compiled instruction document live, and move profiles or trait packs between the web, CLI, and
desktop surfaces with the same versioned `.charui` format.

The project does not call an AI provider, require an account, or put executable code inside trait
packs. Imported content is validated, declarative text.

## What is included

| Surface        | Purpose                                                                                | Persistence                                 |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| Browser studio | Static, install-free trait builder and community pack downloads                        | Versioned browser `localStorage`            |
| Local CLI/UI   | Loopback-only local server plus validate, compile, and defaults commands               | Per-user `library.json`                     |
| Desktop app    | Electron shell with native import/export and `.charui` file handling                   | The same per-user `library.json` as the CLI |
| Core library   | Schemas, defaults, import validation, profile snapshots, and deterministic compilation | No storage or network access                |

The interface combines a three-panel workbench, a warm editorial trait library, and a dense
instruction inspector. The accepted design references are retained in [`design-concepts/`](design-concepts/),
with the concept-to-implementation decisions recorded in the
[`docs/design-ledger.md`](docs/design-ledger.md).

## Features

- Toggle, search, pin, add, edit, archive, and restore traits.
- Apply coherent presets, then tune individual choices.
- Create, rename, select, import, and export profiles.
- Import versioned `.charui`/JSON documents or a deterministic plain-text trait format.
- Preview imported content before installing it; packs never auto-enable traits.
- Compile selected traits with the shared `system-markdown-v1` compiler.
- Download the built-in catalog and curated community catalogs as `.charui` files.
- Work offline after the static assets are available. Optional advertising is disabled unless the
  site owner explicitly supplies both ad environment variables.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- Google Chrome for the configured end-to-end browser suite

No global dependency installation is required for development.

## Run the browser studio

```sh
npm ci
npm run dev
```

Vite serves the development UI on `http://127.0.0.1:4173`.

For a production build and local preview:

```sh
npm run build:web
npm run preview --workspace @character-ui/web
```

The static output is written to `apps/web/dist`.

## Run the local CLI/UI

Build the workspace, then invoke the local CLI entry point:

```sh
npm run build
node packages/cli/dist/index.js serve
```

The server binds to `127.0.0.1` and opens the studio at port `43127` by default. To keep it from
opening a browser or to select another port:

```sh
node packages/cli/dist/index.js serve --no-open --port 44000
```

Other commands operate directly on documents:

```sh
node packages/cli/dist/index.js validate profile.charui
node packages/cli/dist/index.js compile profile.charui
node packages/cli/dist/index.js defaults --output character-ui-defaults.charui
```

`defaults --output` refuses to overwrite an existing file. The package also exposes the
`character-ui` binary when installed or packed as `@character-ui/cli`. Until the first public npm
release, install the reproducible local tarball with:

```sh
npm run build
npm pack --workspace @character-ui/cli
npm install --global ./character-ui-cli-0.1.0.tgz
character-ui serve
```

## Run or package the desktop app

```sh
npm run desktop
```

This builds the shared packages, web UI, and Electron entry points before launching the app. A
Windows NSIS installer can be produced with:

```sh
npm run package:win
```

Packaging output goes to `apps/desktop/release`. Packaged builds associate only `.charui` files—not
all `.json` files—and register the `characterui:` protocol. Local unsigned artifacts are development
builds; release signing and notarization require platform credentials outside this repository.

## The `.charui` format

A `.charui` file is UTF-8 JSON with media type `application/vnd.character-ui+json`. Version 1 has
two document kinds:

- `catalog`: categories, reusable traits, and optional presets.
- `profile`: a portable snapshot of selected traits, including instruction hashes and source
  attribution so the profile does not depend on a catalog remaining installed.

Both kinds start with the same envelope:

Every document declares `"format": "character-ui"`, `"schemaVersion": 1`, a `kind`, and the
corresponding `catalog` or `profile` payload. See the authoritative public schema at
[`schemas/character-ui-v1.schema.json`](schemas/character-ui-v1.schema.json) and a complete catalog
at [`registry/packs/clear-writing.charui`](registry/packs/clear-writing.charui). Runtime validation
additionally enforces catalog-wide referential integrity: IDs must be unique, traits must name
existing categories, and presets must name existing traits. JSON documents are limited to
33,554,432 bytes (32 MiB), which covers the schema's maximum valid catalog and profile payloads.

### Plain-text trait import

Text import uses headings for categories and `Trait label :: System instruction` for traits. Blank
lines and lines beginning with `//` are ignored; Markdown list markers are optional.

```text
# Personality
Curious partner :: Ask a focused question when missing context materially changes the answer.
- Calm under pressure :: Remain steady and solution-oriented when the situation is tense.

# Avoid
No false certainty :: Distinguish verified facts, inferences, and unknowns.
```

Text imports are deterministic and limited to 100,000 bytes and 1,000 lines. The importer creates a
local catalog with `LicenseRef-UserProvided`; review licensing before redistributing it.

## Data and privacy

The public browser studio stores its library in the current browser profile. The CLI and desktop
app share a local file:

- Windows: `%APPDATA%\Character UI\library.json`
- Other systems with `XDG_CONFIG_HOME`: `$XDG_CONFIG_HOME/character-ui/library.json`
- Other systems without it: `~/.config/character-ui/library.json`

The local server and desktop app use an exclusive single-writer lease for this shared file. Close
one before opening the other; a second process exits with the current owner and PID instead of
silently overwriting newer edits. If browser storage is malformed or incompatible, Character UI
preserves the raw value and blocks editing until the user downloads recovery data or deliberately
resets that browser library.

There is no cloud account or provider credential flow. The website reads its static registry files;
the public hosted site makes no ad-network request unless both `VITE_ADSENSE_CLIENT` and
`VITE_ADSENSE_SLOT` are set at build time. Ads remain disabled in desktop, local-server, and
localhost builds. See [SECURITY.md](SECURITY.md) for trust boundaries and reporting instructions.

## Repository layout

```text
apps/web/                React and Vite browser studio
apps/desktop/            Secure Electron shell and packaging configuration
packages/core/           Shared format, validation, defaults, and compiler
packages/local-storage/  Shared per-user filesystem persistence
packages/cli/            Local HTTP adapter and command-line interface
registry/packs/          Curated declarative community catalogs
schemas/                 Public JSON Schemas
tests/e2e/               Desktop and mobile browser journeys
```

The dependency direction and runtime boundaries are documented in
[`docs/architecture.md`](docs/architecture.md).

## Development commands

| Command                     | What it verifies or produces                                                   |
| --------------------------- | ------------------------------------------------------------------------------ |
| `npm run format:check`      | Prettier conformance without modifying files                                   |
| `npm run lint`              | ESLint with zero warnings allowed                                              |
| `npm run typecheck`         | TypeScript checks for every workspace that defines them                        |
| `npm test`                  | Unit and integration tests with Vitest                                         |
| `npm run test:coverage`     | Tests plus configured 80% statement, branch, function, and line thresholds     |
| `npm run registry:build`    | Regenerates the curated registry index from pack files                         |
| `npm run registry:validate` | Confirms the committed index exactly matches validated pack content and hashes |
| `npm run build`             | Builds core, storage, registry, web, CLI, and desktop entry points             |
| `npm run test:e2e`          | Builds the web app and runs desktop/mobile Playwright journeys                 |
| `npm run verify`            | Format, lint, types, registry, coverage, and production builds                 |

Run `npm run verify` before submitting code. See [CONTRIBUTING.md](CONTRIBUTING.md) for pack review,
tests, and pull-request expectations.

## Community registry

Community catalogs live as ordinary, reviewable `.charui` files under `registry/packs`. They cannot
contain scripts, plugins, HTML, or remote imports. To propose a catalog:

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [`registry/README.md`](registry/README.md).
2. Add one catalog file to `registry/packs`.
3. Run `npm run registry:build` and `npm run registry:validate`.
4. Include both the catalog and script-generated `registry/index.json` change in the pull request.

## Deployment

The Pages workflow builds the static site with the base path reported by GitHub Pages, uploads only
`apps/web/dist`, and deploys from the `main` branch or a manual workflow run. Repository Pages must
use **GitHub Actions** as its publishing source. The CI workflow runs the complete repository
verification and the configured Chrome end-to-end suite for pushes and pull requests.

## License

Application code and documentation are licensed under the [MIT License](LICENSE). Built-in trait
wording and repository example catalogs are dedicated under [CC0 1.0 Universal](TRAITS_LICENSE).
Third-party community packs retain the license declared in their `.charui` metadata.
