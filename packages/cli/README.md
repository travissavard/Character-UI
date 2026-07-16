# @character-ui/cli

Until the first public npm release, build and pack the CLI from this repository:

```sh
npm ci
npm run build
npm pack ./packages/cli
npm install --global ./character-ui-cli-0.1.0.tgz
character-ui serve
character-ui validate profile.charui
character-ui compile profile.charui
character-ui defaults --output character-ui-defaults.charui
```

The local server binds only to `127.0.0.1`. Its browser UI and the packaged desktop app use the same per-user library file when both are installed on the same machine.
