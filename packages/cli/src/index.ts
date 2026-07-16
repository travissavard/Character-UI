#!/usr/bin/env node

import { runCli } from './cli.js';

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (caught) {
  process.stderr.write(`${caught instanceof Error ? caught.message : 'Character UI failed.'}\n`);
  process.exitCode = 1;
}
