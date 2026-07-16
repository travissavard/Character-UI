import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { calculateRegistry, serializeRegistry } from './registry-tools.js';

const expected = serializeRegistry(await calculateRegistry());
const actual = await readFile(resolve('registry/index.json'), 'utf8');
if (actual !== expected) {
  throw new Error('registry/index.json is stale. Run npm run registry:build.');
}
console.log('Registry validation passed.');
