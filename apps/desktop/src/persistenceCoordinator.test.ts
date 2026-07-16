import { describe, expect, it, vi } from 'vitest';

import { createSerializedSaveQueue, createShutdownBarrier } from './persistenceCoordinator.js';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('desktop persistence coordinator', () => {
  it('serializes saves in arrival order', async () => {
    const firstWrite = deferred();
    const started: string[] = [];
    const write = vi.fn(async (value: string) => {
      started.push(value);
      if (value === 'first') await firstWrite.promise;
    });
    const queue = createSerializedSaveQueue(write);

    const first = queue.enqueue('first');
    const second = queue.enqueue('second');
    await Promise.resolve();

    expect(started).toEqual(['first']);
    expect(queue.pendingCount).toBe(2);

    firstWrite.resolve();
    await Promise.all([first, second]);

    expect(started).toEqual(['first', 'second']);
    expect(queue.pendingCount).toBe(0);
  });

  it('continues with later saves after a write fails', async () => {
    const write = vi.fn(async (value: string) => {
      if (value === 'invalid') throw new Error('invalid state');
    });
    const queue = createSerializedSaveQueue(write);

    const invalid = queue.enqueue('invalid');
    const valid = queue.enqueue('valid');

    await expect(invalid).rejects.toThrow('invalid state');
    await expect(valid).resolves.toBeUndefined();
    expect(write.mock.calls).toEqual([['invalid'], ['valid']]);
    expect(queue.pendingCount).toBe(0);
  });

  it('closes the queue and waits for the final in-flight save', async () => {
    const writeFinished = deferred();
    const queue = createSerializedSaveQueue(async () => writeFinished.promise);
    const save = queue.enqueue('state');
    await Promise.resolve();

    const drain = queue.closeAndDrain();
    let drained = false;
    void drain.then(() => {
      drained = true;
    });
    await Promise.resolve();

    expect(queue.accepting).toBe(false);
    expect(queue.pendingCount).toBe(1);
    expect(drained).toBe(false);
    await expect(queue.enqueue('too late')).rejects.toThrow('closing');

    writeFinished.resolve();
    await expect(save).resolves.toBeUndefined();
    await expect(drain).resolves.toBeUndefined();
    expect(drained).toBe(true);
    expect(queue.pendingCount).toBe(0);
    expect(queue.closeAndDrain()).toBe(drain);
  });

  it('drains once, releases once, and allows only the final quit attempt', async () => {
    const drainFinished = deferred();
    const releaseFinished = deferred();
    const order: string[] = [];
    const requestFinalQuit = vi.fn(() => order.push('quit'));
    const barrier = createShutdownBarrier({
      closeAndDrain: vi.fn(() => {
        order.push('drain');
        return drainFinished.promise;
      }),
      release: vi.fn(() => {
        order.push('release');
        return releaseFinished.promise;
      }),
      requestFinalQuit,
      onFailure: vi.fn(),
    });

    expect(barrier.shouldPreventQuit()).toBe(true);
    expect(barrier.shouldPreventQuit()).toBe(true);
    expect(barrier.phase).toBe('draining');
    expect(order).toEqual(['drain']);

    drainFinished.resolve();
    await Promise.resolve();
    expect(barrier.phase).toBe('releasing');
    expect(barrier.shouldPreventQuit()).toBe(true);
    expect(order).toEqual(['drain', 'release']);

    releaseFinished.resolve();
    await barrier.waitForCompletion();
    expect(barrier.phase).toBe('released');
    expect(order).toEqual(['drain', 'release', 'quit']);
    expect(requestFinalQuit).toHaveBeenCalledTimes(1);
    expect(barrier.shouldPreventQuit()).toBe(false);
  });

  it('reports a release failure without requesting a final quit', async () => {
    const failure = new Error('lease release failed');
    const requestFinalQuit = vi.fn();
    const onFailure = vi.fn();
    const barrier = createShutdownBarrier({
      closeAndDrain: async () => undefined,
      release: async () => {
        throw failure;
      },
      requestFinalQuit,
      onFailure,
    });

    expect(barrier.shouldPreventQuit()).toBe(true);
    await barrier.waitForCompletion();

    expect(barrier.phase).toBe('failed');
    expect(onFailure).toHaveBeenCalledWith(failure);
    expect(requestFinalQuit).not.toHaveBeenCalled();
    expect(barrier.shouldPreventQuit()).toBe(true);
  });
});
