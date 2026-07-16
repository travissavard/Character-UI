import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await Promise.all([
  build({
    entryPoints: ['src/main.ts'],
    outfile: 'dist/main.cjs',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
    sourcemap: true,
    legalComments: 'none',
  }),
  build({
    entryPoints: ['src/preload.ts'],
    outfile: 'dist/preload.cjs',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
    sourcemap: true,
    legalComments: 'none',
  }),
]);
