import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_DOCUMENT_BYTES } from '@character-ui/core';

import { acquireLibraryLease, loadLibrary, saveLibrary } from './storage.js';

const staticRoot = fileURLToPath(new URL('./public/', import.meta.url));
// The library may contain many individually bounded documents, so its persistence
// envelope is intentionally separate from the portable-document limit.
export const MAX_LIBRARY_BYTES = 128 * 1_024 * 1_024;
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.charui': 'application/vnd.character-ui+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function resolveStaticPath(pathname: string, root = staticRoot): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^\/+/, '') || 'index.html';
  const candidate = resolve(root, relative);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate.startsWith(rootPrefix) || candidate === root ? candidate : null;
}

async function readRequestBody(
  request: IncomingMessage,
  maxBytes = MAX_DOCUMENT_BYTES,
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > maxBytes) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = status === 204 ? '' : JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  response.end(body);
}

async function serveFile(response: ServerResponse, pathname: string, headOnly: boolean) {
  const path = resolveStaticPath(pathname);
  if (!path) {
    sendJson(response, 400, { error: 'Invalid path.' });
    return;
  }
  let fileStat;
  try {
    fileStat = await stat(path);
  } catch {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
  if (!fileStat.isFile()) {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(path)] ?? 'application/octet-stream',
    'Content-Length': fileStat.size,
    'Cache-Control': path.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  });
  if (headOnly) response.end();
  else createReadStream(path).pipe(response);
}

function openBrowser(url: string) {
  const command =
    process.platform === 'win32'
      ? { executable: 'cmd.exe', arguments: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { executable: 'open', arguments: [url] }
        : { executable: 'xdg-open', arguments: [url] };
  const child = spawn(command.executable, command.arguments, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export interface LocalServerOptions {
  port?: number;
  open?: boolean;
  libraryFile?: string;
  /** Primarily useful for constrained embedders and deterministic tests. */
  maxLibraryBytes?: number;
}

export async function startLocalServer(options: LocalServerOptions = {}) {
  const requestedPort = options.port ?? 43127;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
    throw new Error('Port must be an integer from 0 to 65535.');
  }
  const maxLibraryBytes = options.maxLibraryBytes ?? MAX_LIBRARY_BYTES;
  if (!Number.isSafeInteger(maxLibraryBytes) || maxLibraryBytes < 1) {
    throw new Error('Library byte limit must be a positive safe integer.');
  }
  const lease = await acquireLibraryLease({
    runtimeLabel: 'local-server',
    ...(options.libraryFile === undefined ? {} : { libraryFile: options.libraryFile }),
  });

  let actualPort = requestedPort;
  const server = createServer(async (request, response) => {
    try {
      if (!isAllowedHost(request.headers.host, actualPort)) {
        sendJson(response, 403, { error: 'Unrecognized host.' });
        return;
      }
      const rawPathname = (request.url ?? '/').split(/[?#]/, 1)[0] ?? '/';
      if (!resolveStaticPath(rawPathname)) {
        sendJson(response, 400, { error: 'Invalid path.' });
        return;
      }
      const origin = `http://${request.headers.host}`;
      const url = new URL(request.url ?? '/', origin);
      if (url.pathname === '/api/runtime' && request.method === 'GET') {
        sendJson(response, 200, { local: true, storage: 'shared-user-library' });
        return;
      }
      if (url.pathname === '/api/library' && request.method === 'GET') {
        sendJson(response, 200, await loadLibrary(options.libraryFile));
        return;
      }
      if (url.pathname === '/api/library' && request.method === 'PUT') {
        if (request.headers.origin !== origin) {
          sendJson(response, 403, { error: 'Origin does not match the local server.' });
          return;
        }
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
          sendJson(response, 415, { error: 'Expected application/json.' });
          return;
        }
        const raw = await readRequestBody(request, maxLibraryBytes);
        await saveLibrary(JSON.parse(raw) as never, options.libraryFile);
        sendJson(response, 204, null);
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        response.setHeader('Allow', 'GET, HEAD, PUT');
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
      }
      await serveFile(response, url.pathname, request.method === 'HEAD');
    } catch (caught) {
      sendJson(response, 400, {
        error: caught instanceof Error ? caught.message : 'Request failed.',
      });
    }
  });

  try {
    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(requestedPort, '127.0.0.1', () => resolvePromise());
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Local server did not expose a TCP port.');
    actualPort = address.port;
    const url = `http://127.0.0.1:${actualPort}/`;
    server.once('close', () => {
      void lease.release().catch(() => undefined);
    });
    if (options.open !== false) openBrowser(url);
    const close = async (): Promise<void> => {
      let closeError: Error | undefined;
      if (server.listening) {
        await new Promise<void>((resolvePromise) => {
          server.close((error) => {
            closeError = error;
            resolvePromise();
          });
        });
      }
      await lease.release();
      if (closeError) throw closeError;
    };
    return { server, url, port: actualPort, lease, close };
  } catch (caught) {
    if (server.listening) {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
    await lease.release();
    throw caught;
  }
}
