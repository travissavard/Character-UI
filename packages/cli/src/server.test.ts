import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createInitialLibraryState } from '@character-ui/core';

import { isAllowedHost, resolveStaticPath, startLocalServer } from './server.js';

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((run) => run()));
});

describe('local server security boundaries', () => {
  it('accepts only exact loopback hosts', () => {
    expect(isAllowedHost('127.0.0.1:43127', 43127)).toBe(true);
    expect(isAllowedHost('localhost:43127', 43127)).toBe(true);
    expect(isAllowedHost('127.0.0.1.attacker.test:43127', 43127)).toBe(false);
    expect(isAllowedHost(undefined, 43127)).toBe(false);
  });

  it('rejects path traversal and malformed encodings', () => {
    const root = join(tmpdir(), 'character-ui-public');
    expect(resolveStaticPath('/assets/app.js', root)).toBe(join(root, 'assets', 'app.js'));
    expect(resolveStaticPath('/../../secret.txt', root)).toBeNull();
    expect(resolveStaticPath('/%2e%2e/%2e%2e/secret.txt', root)).toBeNull();
    expect(resolveStaticPath('/%E0%A4%A', root)).toBeNull();
  });

  it('requires same-origin JSON writes and persists valid state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'character-ui-cli-test-'));
    const libraryFile = join(directory, 'library.json');
    const localServer = await startLocalServer({ port: 0, open: false, libraryFile });
    const { url, port } = localServer;
    cleanup.push(async () => {
      await localServer.close();
      await rm(directory, { recursive: true, force: true });
    });

    const runtime = await fetch(`${url}api/runtime`);
    expect(runtime.status).toBe(200);
    expect(await runtime.json()).toMatchObject({ local: true });

    const hostile = await fetch(`${url}api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.test' },
      body: JSON.stringify(createInitialLibraryState('2026-01-01T00:00:00.000Z')),
    });
    expect(hostile.status).toBe(403);

    const state = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    const saved = await fetch(`${url}api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify(state),
    });
    expect(saved.status).toBe(204);
    expect(JSON.parse(await readFile(libraryFile, 'utf8'))).toEqual(state);

    const rebindingStatus = await new Promise<number | undefined>((resolvePromise, reject) => {
      const request = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/runtime',
          headers: { Host: `evil.test:${port}` },
        },
        (response) => {
          response.resume();
          response.once('end', () => resolvePromise(response.statusCode));
        },
      );
      request.once('error', reject);
      request.end();
    });
    expect(rebindingStatus).toBe(403);
  });

  it('holds an exclusive library lease and releases it through the managed close path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'character-ui-server-lease-test-'));
    const libraryFile = join(directory, 'library.json');
    const first = await startLocalServer({ port: 0, open: false, libraryFile });
    let second: Awaited<ReturnType<typeof startLocalServer>> | undefined;
    try {
      await expect(startLocalServer({ port: 0, open: false, libraryFile })).rejects.toMatchObject({
        code: 'CHARACTER_UI_LIBRARY_LOCKED',
      });

      await first.close();
      second = await startLocalServer({ port: 0, open: false, libraryFile });
      expect((await fetch(`${second.url}api/runtime`)).status).toBe(200);
    } finally {
      await first.close();
      await second?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
