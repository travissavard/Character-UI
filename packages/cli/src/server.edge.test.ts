import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createInitialLibraryState } from '@character-ui/core';

import { startLocalServer } from './server.js';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const servers: Array<Awaited<ReturnType<typeof startLocalServer>>> = [];
const temporaryDirectories: string[] = [];

beforeAll(async () => {
  await mkdir(`${publicRoot}/assets`, { recursive: true });
  await mkdir(`${publicRoot}/directory`, { recursive: true });
  await writeFile(`${publicRoot}/index.html`, '<!doctype html><title>Character UI</title>', 'utf8');
  await writeFile(`${publicRoot}/assets/app.js`, 'globalThis.characterUiLoaded = true;', 'utf8');
  await writeFile(`${publicRoot}/download.bin`, 'binary fixture', 'utf8');
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

afterAll(async () => {
  await rm(publicRoot, { recursive: true, force: true });
});

async function launch(options: { maxLibraryBytes?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'character-ui-server-edge-'));
  temporaryDirectories.push(directory);
  const result = await startLocalServer({
    port: 0,
    open: false,
    libraryFile: join(directory, 'library.json'),
    ...options,
  });
  servers.push(result);
  return result;
}

function rawRequest(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{
  status: number | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method,
        headers: { Host: `127.0.0.1:${port}`, ...options.headers },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('end', () =>
          resolvePromise({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.once('error', reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

describe('local server protocol edges', () => {
  it('rejects invalid port values before binding', async () => {
    await expect(startLocalServer({ port: -1, open: false })).rejects.toThrow(
      'Port must be an integer',
    );
    await expect(startLocalServer({ port: 65_536, open: false })).rejects.toThrow(
      'Port must be an integer',
    );
    await expect(startLocalServer({ port: 1.5, open: false })).rejects.toThrow(
      'Port must be an integer',
    );
  });

  it('serves root, scripts, binary assets, and HEAD requests with hardened headers', async () => {
    const { url } = await launch();
    const root = await fetch(url);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('Character UI');
    expect(root.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(root.headers.get('cache-control')).toBe('no-cache');
    expect(root.headers.get('content-security-policy')).toContain("object-src 'none'");

    const script = await fetch(`${url}assets/app.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(script.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await script.text()).toContain('characterUiLoaded');

    const binary = await fetch(`${url}download.bin`);
    expect(binary.headers.get('content-type')).toBe('application/octet-stream');

    const head = await fetch(`${url}assets/app.js`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(Number(head.headers.get('content-length'))).toBeGreaterThan(0);
  });

  it('returns not found for missing and directory static paths', async () => {
    const { url } = await launch();
    const missing = await fetch(`${url}missing.css`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Not found.' });

    const directory = await fetch(`${url}directory`);
    expect(directory.status).toBe(404);
    expect(await directory.json()).toEqual({ error: 'Not found.' });
  });

  it('rejects invalid encoded paths before URL routing', async () => {
    const { port } = await launch();
    const nul = await rawRequest(port, '/assets/%00app.js');
    expect(nul.status).toBe(400);
    expect(JSON.parse(nul.body)).toEqual({ error: 'Invalid path.' });

    const malformed = await rawRequest(port, '/assets/%E0%A4%A');
    expect(malformed.status).toBe(400);
    expect(JSON.parse(malformed.body)).toEqual({ error: 'Invalid path.' });
  });

  it('reads the default library and accepts query strings on runtime routes', async () => {
    const { url } = await launch();
    const library = await fetch(`${url}api/library`);
    expect(library.status).toBe(200);
    expect(await library.json()).toMatchObject({ activeProfileId: 'thoughtful-collaborator' });

    const runtime = await fetch(`${url}api/runtime?cache=no#ignored`);
    expect(runtime.status).toBe(200);
    expect(await runtime.json()).toEqual({ local: true, storage: 'shared-user-library' });
  });

  it('rejects wrong content types, malformed JSON, and invalid library payloads', async () => {
    const { url, port } = await launch();
    const headers = { Origin: `http://127.0.0.1:${port}` };

    const text = await fetch(`${url}api/library`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(text.status).toBe(415);
    expect(await text.json()).toEqual({ error: 'Expected application/json.' });

    const malformed = await fetch(`${url}api/library`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toContain('JSON');

    const invalid = await fetch(`${url}api/library`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
      body: '{}',
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBeTruthy();
  });

  it('accepts a schema-valid library larger than one document', async () => {
    const { url, port } = await launch();
    const state = createInitialLibraryState('2026-02-03T04:05:06.000Z');
    state.personalTraits = Array.from({ length: 500 }, (_, index) => ({
      id: `large-trait-${index}`,
      label: `Large trait ${index}`,
      categoryId: 'personality',
      description: 'd'.repeat(1_000),
      instruction: 'i'.repeat(2_000),
      tags: ['boundary'],
      order: index,
    }));
    const body = JSON.stringify(state);
    expect(Buffer.byteLength(body)).toBeGreaterThan(1_048_576);
    const response = await fetch(`${url}api/library`, {
      method: 'PUT',
      headers: {
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    expect(response.status).toBe(204);
  });

  it('rejects request bodies above the configured library limit', async () => {
    const { port } = await launch({ maxLibraryBytes: 256 });
    const response = await rawRequest(port, '/api/library', {
      method: 'PUT',
      headers: {
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ padding: 'x'.repeat(256) }),
    });
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'Request body is too large.' });
  });

  it('returns method metadata without falling through to static serving', async () => {
    const { url } = await launch();
    const response = await fetch(`${url}api/runtime`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD, PUT');
    expect(await response.json()).toEqual({ error: 'Method not allowed.' });
  });

  it('accepts a localhost Host header as the second exact loopback spelling', async () => {
    const { port } = await launch();
    const response = await rawRequest(port, '/api/runtime', {
      headers: { Host: `localhost:${port}` },
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ local: true });
  });

  it('round-trips a valid JSON body with a parameterized media type', async () => {
    const { url, port } = await launch();
    const state = createInitialLibraryState('2026-02-03T04:05:06.000Z');
    const response = await fetch(`${url}api/library`, {
      method: 'PUT',
      headers: {
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(state),
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
});
