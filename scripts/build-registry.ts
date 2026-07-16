import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { calculateRegistry, serializeRegistry } from './registry-tools.js';

const index = await calculateRegistry();
await writeFile(resolve('registry/index.json'), serializeRegistry(index), 'utf8');
console.log(`Registry index generated with ${index.packs.length} pack(s).`);
