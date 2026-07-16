# Security policy

Character UI handles user-authored system instructions and imported community catalogs. Treat every
imported document as untrusted data, even when it came from the curated registry.

## Supported code

Security fixes are applied to the current default branch and the latest published release, when a
release exists. Older snapshots and locally modified builds are not maintained as separate security
lines.

## Reporting a vulnerability

Do not disclose an exploitable vulnerability, private data, or a proof of concept in a public issue.

Use **Security → Report a vulnerability** in the GitHub repository when private vulnerability
reporting is available. Include:

- Affected commit, package, surface, and platform.
- Reproduction steps with the smallest safe test document or request.
- Expected and actual behavior.
- Security impact and required attacker capabilities.
- Any mitigation you have already confirmed.

If private vulnerability reporting is not available, open a public issue asking the maintainers to
establish a private contact channel, but include no vulnerability details. Platform abuse or threats
should also be reported through GitHub's own abuse-reporting tools.

Maintainers will validate the report, coordinate a fix and disclosure when reproducible, and credit
reporters who want attribution. Please allow a remediation window before public disclosure.

## Security boundaries

- `.charui` catalogs and profiles are declarative JSON. They are not scripts, templates, plugins,
  or permission grants.
- Runtime validation rejects unknown properties, unsupported schema versions, oversized documents,
  invalid IDs, broken references, and malformed snapshots.
- The local CLI server binds to `127.0.0.1` and checks the host, origin, content type, request size,
  HTTP method, and resolved static path.
- The Electron renderer is sandboxed, context-isolated, and has no Node integration. Native access
  is exposed through a fixed, argument-validated preload API.
- The desktop application uses its private `character-ui-app://` asset scheme, blocks arbitrary
  navigation and new windows, and registers only `.charui` as its document association.
- The browser build uses local storage. The CLI and desktop app use a per-user local JSON file.
- Imported packs never auto-enable traits and never execute content.
- No AI-provider credentials are accepted or stored.

These controls reduce risk; they do not make community wording trustworthy. Review the exact traits
and license before enabling or redistributing a pack.

## Operational guidance

- Install dependencies from the committed lockfile with `npm ci`.
- Run `npm audit`, `npm run verify`, and relevant negative tests before a release.
- Do not publish unsigned local packaging output as a trusted release.
- Keep ad configuration empty unless the site owner has completed the selected network's privacy,
  consent, and policy requirements.
- Never commit credentials in source, `.env` files, examples, test fixtures, workflows, or packs.

For non-security bugs and feature requests, use the repository's normal issue tracker.
