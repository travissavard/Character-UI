# Architecture

Character UI is an npm-workspace monorepo with one dependency direction:

```text
@character-ui/core
        ↑
  ┌─────┼───────────┐
  │     │           │
 web   CLI       desktop
  │     │           │
static local HTTP  Electron IPC
site   adapter      adapter
```

`@character-ui/core` exclusively owns document schemas, validation, normalization, built-in catalogs, profile snapshots, and deterministic compilation. It has no React, Electron, filesystem, or network dependency.

The React web package owns presentation and browser-safe interaction. On the public site it persists a versioned library in `localStorage`. When served by the CLI it uses a same-origin loopback storage API. In Electron it uses a narrow context-isolated preload bridge. Import/export behavior remains identical because every adapter calls the core package.

The CLI binds only to `127.0.0.1`, serves bundled static assets, and exposes a same-origin JSON state endpoint guarded by strict host/origin/content-type/size checks. It also provides non-interactive validation and compilation commands.

The Electron main process owns native dialogs, persistent files, custom-file opening, and protocol activation. The renderer is sandboxed, has no Node integration, loads only packaged `character-ui-app://` assets, and receives a fixed set of argument-validated IPC methods.

Community packs are declarative `.charui` catalog documents in `registry/packs`. CI regenerates and validates `registry/index.json`; imported packs never execute code or auto-enable traits.
