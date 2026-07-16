import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@character-ui/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@character-ui/local-storage': fileURLToPath(
        new URL('./packages/local-storage/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'packages/core/src/**/*.ts',
        'packages/local-storage/src/**/*.ts',
        'packages/cli/src/{server,storage}.ts',
        'apps/desktop/src/security.ts',
      ],
      exclude: ['**/*.test.ts', '**/index.ts', '**/types.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
