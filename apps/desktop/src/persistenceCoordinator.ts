export interface SerializedSaveQueue<T> {
  readonly accepting: boolean;
  readonly pendingCount: number;
  enqueue(value: T): Promise<void>;
  closeAndDrain(): Promise<void>;
}

export function createSerializedSaveQueue<T>(
  write: (value: T) => Promise<void>,
): SerializedSaveQueue<T> {
  let accepting = true;
  let pendingCount = 0;
  let tail: Promise<void> = Promise.resolve();
  let drainPromise: Promise<void> | undefined;

  return {
    get accepting() {
      return accepting;
    },
    get pendingCount() {
      return pendingCount;
    },
    enqueue(value) {
      if (!accepting) {
        return Promise.reject(new Error('Character UI is closing and cannot accept another save.'));
      }

      pendingCount += 1;
      const operation = tail.then(() => write(value));
      tail = operation.then(
        () => {
          pendingCount -= 1;
        },
        () => {
          pendingCount -= 1;
        },
      );
      return operation;
    },
    closeAndDrain() {
      accepting = false;
      drainPromise ??= tail;
      return drainPromise;
    },
  };
}

export type ShutdownPhase = 'running' | 'draining' | 'releasing' | 'released' | 'failed';

export interface ShutdownBarrier {
  readonly phase: ShutdownPhase;
  shouldPreventQuit(): boolean;
  waitForCompletion(): Promise<void>;
}

export interface ShutdownBarrierOptions {
  closeAndDrain: () => Promise<void>;
  release: () => Promise<void>;
  requestFinalQuit: () => void;
  onFailure: (error: unknown) => void;
}

export function createShutdownBarrier(options: ShutdownBarrierOptions): ShutdownBarrier {
  let phase: ShutdownPhase = 'running';
  let completion: Promise<void> | undefined;

  async function drainAndRelease(): Promise<void> {
    try {
      await options.closeAndDrain();
      phase = 'releasing';
      await options.release();
      phase = 'released';
      options.requestFinalQuit();
    } catch (caught) {
      phase = 'failed';
      options.onFailure(caught);
    }
  }

  return {
    get phase() {
      return phase;
    },
    shouldPreventQuit() {
      if (phase === 'released') return false;
      if (phase === 'running') {
        phase = 'draining';
        completion = drainAndRelease();
      }
      return true;
    },
    waitForCompletion() {
      return completion ?? Promise.resolve();
    },
  };
}
