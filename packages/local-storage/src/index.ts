import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  createInitialLibraryState,
  verifyLibraryIntegrity,
  type LocalLibraryState,
} from '@character-ui/core';

export function libraryPath(environment: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === 'win32' && environment.APPDATA) {
    return join(environment.APPDATA, 'Character UI', 'library.json');
  }
  if (environment.XDG_CONFIG_HOME) {
    return join(environment.XDG_CONFIG_HOME, 'character-ui', 'library.json');
  }
  return join(homedir(), '.config', 'character-ui', 'library.json');
}

export interface LibraryLeaseOwner {
  version: 1;
  token: string;
  pid: number;
  runtimeLabel: string;
  acquiredAt: string;
}

export interface LibraryLease {
  owner: LibraryLeaseOwner;
  lockPath: string;
  release: () => Promise<void>;
}

export interface AcquireLibraryLeaseOptions {
  libraryFile?: string;
  runtimeLabel: string;
}

export class LibraryLeaseConflictError extends Error {
  readonly code = 'CHARACTER_UI_LIBRARY_LOCKED';
  readonly owner: LibraryLeaseOwner | undefined;
  readonly lockPath: string;

  constructor(message: string, lockPath: string, owner?: LibraryLeaseOwner) {
    super(message);
    this.name = 'LibraryLeaseConflictError';
    this.lockPath = lockPath;
    this.owner = owner;
  }
}

const OWNER_FILE = 'owner.json';
const OWNER_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseLeaseOwner(value: unknown): LibraryLeaseOwner | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const owner = value as Record<string, unknown>;
  if (
    owner.version !== 1 ||
    typeof owner.token !== 'string' ||
    !OWNER_TOKEN.test(owner.token) ||
    !Number.isSafeInteger(owner.pid) ||
    (owner.pid as number) < 1 ||
    typeof owner.runtimeLabel !== 'string' ||
    owner.runtimeLabel.length < 1 ||
    owner.runtimeLabel.length > 120 ||
    typeof owner.acquiredAt !== 'string' ||
    Number.isNaN(Date.parse(owner.acquiredAt))
  ) {
    return null;
  }
  return owner as unknown as LibraryLeaseOwner;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readLeaseOwner(lockPath: string): Promise<LibraryLeaseOwner | null> {
  try {
    return parseLeaseOwner(
      JSON.parse(await readFile(join(lockPath, OWNER_FILE), 'utf8')) as unknown,
    );
  } catch {
    return null;
  }
}

function isProcessProvablyDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (caught) {
    return (caught as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function leaseConflictMessage(
  libraryFile: string,
  lockPath: string,
  requester: string,
  owner: LibraryLeaseOwner | null,
): string {
  if (!owner) {
    return `Character UI cannot open ${libraryFile} for ${requester} because ${lockPath} has unreadable owner metadata. Refusing to remove the lease automatically; inspect or remove it only after confirming no Character UI process is running.`;
  }
  return `Character UI cannot open ${libraryFile} for ${requester}; ${owner.runtimeLabel} (PID ${owner.pid}) has held the library lease since ${owner.acquiredAt}. Close that process and try again.`;
}

async function releaseOwnedLease(lockPath: string, owner: LibraryLeaseOwner): Promise<void> {
  const current = await readLeaseOwner(lockPath);
  if (current?.token !== owner.token) return;

  const releasePath = `${lockPath}.released-${owner.token}`;
  try {
    await rename(lockPath, releasePath);
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw caught;
  }

  const moved = await readLeaseOwner(releasePath);
  if (moved?.token !== owner.token) {
    if (!(await pathExists(lockPath))) {
      try {
        await rename(releasePath, lockPath);
      } catch {
        // Leave the unexpected owner's directory intact if it cannot be restored atomically.
      }
    }
    return;
  }
  await rm(releasePath, { recursive: true, force: true });
}

export async function acquireLibraryLease(
  options: AcquireLibraryLeaseOptions,
): Promise<LibraryLease> {
  const runtimeLabel = options.runtimeLabel.trim();
  if (!runtimeLabel || runtimeLabel.length > 120) {
    throw new Error('Library lease runtimeLabel must contain 1 to 120 characters.');
  }
  const libraryFile = options.libraryFile ?? libraryPath();
  const lockPath = `${libraryFile}.lease`;
  await mkdir(dirname(libraryFile), { recursive: true });

  const owner: LibraryLeaseOwner = {
    version: 1,
    token: randomUUID(),
    pid: process.pid,
    runtimeLabel,
    acquiredAt: new Date().toISOString(),
  };
  const candidatePath = `${lockPath}.candidate-${owner.token}`;
  await mkdir(candidatePath);
  await writeFile(join(candidatePath, OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });

  let acquired = false;
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await rename(candidatePath, lockPath);
        acquired = true;
        let releasePromise: Promise<void> | undefined;
        return {
          owner,
          lockPath,
          release: () => {
            releasePromise ??= releaseOwnedLease(lockPath, owner);
            return releasePromise;
          },
        };
      } catch {
        if (!(await pathExists(lockPath))) continue;
      }

      const existingOwner = await readLeaseOwner(lockPath);
      if (!existingOwner) {
        throw new LibraryLeaseConflictError(
          leaseConflictMessage(libraryFile, lockPath, runtimeLabel, null),
          lockPath,
        );
      }
      if (!isProcessProvablyDead(existingOwner.pid)) {
        throw new LibraryLeaseConflictError(
          leaseConflictMessage(libraryFile, lockPath, runtimeLabel, existingOwner),
          lockPath,
          existingOwner,
        );
      }

      const recoveredPath = `${lockPath}.recovered-${existingOwner.token}`;
      try {
        await rename(lockPath, recoveredPath);
      } catch {
        // A concurrent acquirer changed the lock. Re-read it on the next bounded attempt.
      }
    }
    throw new LibraryLeaseConflictError(
      `Character UI could not acquire ${lockPath} for ${runtimeLabel} after concurrent lease changes. Try again after the other Character UI process exits.`,
      lockPath,
    );
  } finally {
    if (!acquired) await rm(candidatePath, { recursive: true, force: true });
  }
}

export async function loadLibrary(path = libraryPath()): Promise<LocalLibraryState> {
  try {
    await access(path, constants.R_OK);
  } catch {
    return createInitialLibraryState();
  }
  const raw = await readFile(path, 'utf8');
  return verifyLibraryIntegrity(JSON.parse(raw) as unknown);
}

export async function saveLibrary(value: unknown, path = libraryPath()): Promise<void> {
  const validated = await verifyLibraryIntegrity(value);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  try {
    await rename(temporary, path);
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException;
    if (process.platform !== 'win32' || !['EEXIST', 'EPERM'].includes(error.code ?? ''))
      throw caught;
    await rm(path, { force: true });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
