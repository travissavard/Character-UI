import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LibraryLeaseConflictError, acquireLibraryLease, type LibraryLeaseOwner } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryLibrary(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'character-ui-lease-'));
  temporaryDirectories.push(directory);
  return join(directory, 'nested', 'library.json');
}

async function readOwner(lockPath: string): Promise<LibraryLeaseOwner> {
  return JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')) as LibraryLeaseOwner;
}

describe('shared library single-writer leases', () => {
  it('acquires atomically, reports the live owner, and allows acquisition after release', async () => {
    const libraryFile = await temporaryLibrary();
    const first = await acquireLibraryLease({ libraryFile, runtimeLabel: 'desktop-test' });
    const storedOwner = await readOwner(first.lockPath);

    expect(storedOwner).toEqual(first.owner);
    expect(storedOwner).toMatchObject({
      version: 1,
      pid: process.pid,
      runtimeLabel: 'desktop-test',
    });
    expect(storedOwner.token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Number.isNaN(Date.parse(storedOwner.acquiredAt))).toBe(false);

    await expect(
      acquireLibraryLease({ libraryFile, runtimeLabel: 'cli-test' }),
    ).rejects.toMatchObject({
      name: 'LibraryLeaseConflictError',
      code: 'CHARACTER_UI_LIBRARY_LOCKED',
      owner: first.owner,
      lockPath: first.lockPath,
    });
    await expect(acquireLibraryLease({ libraryFile, runtimeLabel: 'cli-test' })).rejects.toThrow(
      `desktop-test (PID ${process.pid})`,
    );

    await first.release();
    const second = await acquireLibraryLease({ libraryFile, runtimeLabel: 'cli-test' });
    expect(second.owner.token).not.toBe(first.owner.token);
    await second.release();
  });

  it('makes release idempotent and never removes a replacement owner', async () => {
    const libraryFile = await temporaryLibrary();
    const first = await acquireLibraryLease({ libraryFile, runtimeLabel: 'first-owner' });
    const displacedPath = `${first.lockPath}.displaced`;
    await rename(first.lockPath, displacedPath);

    const replacementOwner: LibraryLeaseOwner = {
      version: 1,
      token: randomUUID(),
      pid: process.pid,
      runtimeLabel: 'replacement-owner',
      acquiredAt: new Date().toISOString(),
    };
    await mkdir(first.lockPath);
    await writeFile(
      join(first.lockPath, 'owner.json'),
      `${JSON.stringify(replacementOwner, null, 2)}\n`,
      'utf8',
    );

    await first.release();
    await first.release();
    expect(await readOwner(first.lockPath)).toEqual(replacementOwner);
  });

  it('recovers a stale lease only after its operating-system process has exited', async () => {
    const libraryFile = await temporaryLibrary();
    const lockPath = `${libraryFile}.lease`;
    await mkdir(lockPath, { recursive: true });

    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    const deadPid = child.pid;
    expect(deadPid).toBeDefined();
    await new Promise<void>((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (code === 0) resolvePromise();
        else reject(new Error(`Lease fixture process exited with ${code ?? signal}.`));
      });
    });

    const staleOwner: LibraryLeaseOwner = {
      version: 1,
      token: randomUUID(),
      pid: deadPid!,
      runtimeLabel: 'crashed-runtime',
      acquiredAt: '2026-01-02T03:04:05.000Z',
    };
    await writeFile(
      join(lockPath, 'owner.json'),
      `${JSON.stringify(staleOwner, null, 2)}\n`,
      'utf8',
    );

    const recovered = await acquireLibraryLease({
      libraryFile,
      runtimeLabel: 'recovery-runtime',
    });
    expect(recovered.owner.token).not.toBe(staleOwner.token);
    expect(await readOwner(recovered.lockPath)).toEqual(recovered.owner);
    expect(await readOwner(`${lockPath}.recovered-${staleOwner.token}`)).toEqual(staleOwner);
    await recovered.release();
  }, 30_000); // Starting a fresh Node process can take several seconds on cold Windows CI hosts.

  it('refuses to remove malformed owner metadata because liveness cannot be proven', async () => {
    const libraryFile = await temporaryLibrary();
    const lockPath = `${libraryFile}.lease`;
    await mkdir(lockPath, { recursive: true });
    await writeFile(join(lockPath, 'owner.json'), '{"pid":"unknown"}\n', 'utf8');

    const failure = await acquireLibraryLease({
      libraryFile,
      runtimeLabel: 'careful-runtime',
    }).catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(LibraryLeaseConflictError);
    expect((failure as Error).message).toContain('unreadable owner metadata');
    expect(await readFile(join(lockPath, 'owner.json'), 'utf8')).toBe('{"pid":"unknown"}\n');
  });

  it('validates the runtime label before creating lock artifacts', async () => {
    const libraryFile = await temporaryLibrary();
    await expect(acquireLibraryLease({ libraryFile, runtimeLabel: '   ' })).rejects.toThrow(
      'runtimeLabel',
    );
    await expect(
      acquireLibraryLease({ libraryFile, runtimeLabel: 'x'.repeat(121) }),
    ).rejects.toThrow('runtimeLabel');
  });
});
