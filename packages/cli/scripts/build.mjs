import { rm } from 'node:fs/promises';

import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['zod'],
  sourcemap: true,
  legalComments: 'external',
  tsconfigRaw: {
    compilerOptions: {
      target: 'ES2022',
    },
  },
});
