import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from './cli.js';
import { libraryPath } from './storage.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('serve lifecycle', () => {
  it('closes the listening server and removes signal handlers on Ctrl+C', async () => {
    const baselineSigint = process.listenerCount('SIGINT');
    const baselineSigterm = process.listenerCount('SIGTERM');
    const directory = await mkdtemp(join(tmpdir(), 'character-ui-cli-lifecycle-'));
    const originalAppData = process.env.APPDATA;
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.APPDATA = directory;
    process.env.XDG_CONFIG_HOME = directory;
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    let running: Promise<number> | undefined;
    try {
      const lockPath = `${libraryPath()}.lease`;
      running = runCli(['serve', '--port', '0', '--no-open']);
      await vi.waitFor(() => {
        expect(process.listenerCount('SIGINT')).toBe(baselineSigint + 1);
      });
      const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(output.join(''))?.[0];
      expect(url).toBeTruthy();
      expect((await fetch(`${url}api/runtime`)).status).toBe(200);

      process.emit('SIGINT', 'SIGINT');
      await expect(running).resolves.toBe(0);
      running = undefined;
      expect(process.listenerCount('SIGINT')).toBe(baselineSigint);
      expect(process.listenerCount('SIGTERM')).toBe(baselineSigterm);
      await expect(fetch(`${url}api/runtime`)).rejects.toThrow();
      await expect(access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      if (running && process.listenerCount('SIGINT') > baselineSigint) {
        process.emit('SIGINT', 'SIGINT');
        await running.catch(() => undefined);
      }
      if (originalAppData === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = originalAppData;
      if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
