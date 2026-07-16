import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  DEFAULT_CATALOG_DOCUMENT,
  MAX_DOCUMENT_BYTES,
  compileSnapshots,
  parseDocumentText,
  serializeDocument,
  verifyDocumentIntegrity,
} from '@character-ui/core';

import { startLocalServer } from './server.js';

const HELP = `Character UI

Usage:
  character-ui serve [--port 43127] [--no-open]
  character-ui validate <document.charui>
  character-ui compile <profile.charui>
  character-ui defaults [--output character-ui-defaults.charui]
  character-ui help
`;

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readBoundedFile(path: string): Promise<string> {
  const resolvedPath = resolve(path);
  const fileStat = await stat(resolvedPath);
  if (!fileStat.isFile() || fileStat.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`Document exceeds the ${MAX_DOCUMENT_BYTES.toLocaleString()} byte limit.`);
  }
  const raw = await readFile(resolvedPath, 'utf8');
  if (Buffer.byteLength(raw) > MAX_DOCUMENT_BYTES) {
    throw new Error(`Document exceeds the ${MAX_DOCUMENT_BYTES.toLocaleString()} byte limit.`);
  }
  return raw;
}

export async function runCli(args: string[]): Promise<number> {
  const [command = 'help', subject] = args;
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === 'serve') {
    const rawPort = valueAfter(args, '--port');
    const port = rawPort ? Number(rawPort) : 43127;
    const { url, close } = await startLocalServer({
      port,
      open: !args.includes('--no-open'),
    });
    process.stdout.write(`Character UI is running at ${url}\nPress Ctrl+C to stop.\n`);
    return await new Promise<number>((resolvePromise, rejectPromise) => {
      let stopping = false;
      const cleanup = () => {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
      };
      const stop = () => {
        if (stopping) return;
        stopping = true;
        void close().then(
          () => {
            cleanup();
            resolvePromise(0);
          },
          (caught: unknown) => {
            cleanup();
            rejectPromise(caught);
          },
        );
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
  }
  if (command === 'validate') {
    if (!subject) throw new Error('validate requires a .charui or JSON file path.');
    const document = await verifyDocumentIntegrity(
      parseDocumentText(await readBoundedFile(subject)),
    );
    const name = document.kind === 'catalog' ? document.catalog.name : document.profile.name;
    process.stdout.write(`Valid ${document.kind}: ${name}\n`);
    return 0;
  }
  if (command === 'compile') {
    if (!subject) throw new Error('compile requires a profile .charui file path.');
    const document = await verifyDocumentIntegrity(
      parseDocumentText(await readBoundedFile(subject)),
    );
    if (document.kind !== 'profile') throw new Error('compile requires a profile document.');
    const categories = Array.from(
      new Map(
        document.profile.selectedTraits.map((trait, index) => [
          trait.categoryId,
          { id: trait.categoryId, label: trait.categoryLabel, order: index * 100 },
        ]),
      ).values(),
    );
    const output = await compileSnapshots(
      document.profile.selectedTraits,
      categories,
      document.profile.categoryOrder,
    );
    process.stdout.write(output.text);
    return 0;
  }
  if (command === 'defaults') {
    const output = valueAfter(args, '--output');
    const serialized = serializeDocument(DEFAULT_CATALOG_DOCUMENT);
    if (output) {
      await writeFile(resolve(output), serialized, { encoding: 'utf8', flag: 'wx' });
      process.stdout.write(`Wrote ${resolve(output)}\n`);
    } else {
      process.stdout.write(serialized);
    }
    return 0;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}
