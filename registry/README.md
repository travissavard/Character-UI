# Community registry

Community catalogs are reviewed as ordinary Git pull requests. Add one declarative `.charui` catalog to `registry/packs`; do not edit `registry/index.json` by hand.

Before opening a pull request:

```sh
npm run registry:build
npm run registry:validate
```

Requirements:

- Stable lowercase catalog and trait IDs.
- Semantic catalog version.
- SPDX-style license identifier and permission to publish the submitted wording.
- No scripts, templates, commands, secrets, remote imports, HTML, or executable content.
- Concise descriptions and exact provider-neutral system instructions.
- A version bump whenever published pack content changes.
