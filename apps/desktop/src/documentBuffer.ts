export interface DocumentBuffer<T> {
  receive(value: T): void;
  subscribe(listener: (value: T) => void): () => void;
}

export function createDocumentBuffer<T>(): DocumentBuffer<T> {
  const pending: T[] = [];
  const listeners = new Set<(value: T) => void>();
  return {
    receive(value) {
      if (listeners.size === 0) {
        pending.push(value);
        return;
      }
      for (const listener of listeners) listener(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      for (const value of pending.splice(0)) listener(value);
      return () => listeners.delete(listener);
    },
  };
}
