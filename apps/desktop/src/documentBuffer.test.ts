import { describe, expect, it, vi } from 'vitest';

import { createDocumentBuffer } from './documentBuffer.js';

describe('desktop opened-document buffer', () => {
  it('drains startup documents in order when the renderer subscribes', () => {
    const buffer = createDocumentBuffer<string>();
    const listener = vi.fn();
    buffer.receive('first.charui');
    buffer.receive('second.charui');

    buffer.subscribe(listener);

    expect(listener.mock.calls).toEqual([['first.charui'], ['second.charui']]);
  });

  it('delivers live documents and resumes buffering after unsubscribe', () => {
    const buffer = createDocumentBuffer<string>();
    const first = vi.fn();
    const unsubscribe = buffer.subscribe(first);
    buffer.receive('live.charui');
    unsubscribe();
    buffer.receive('between-subscribers.charui');

    const second = vi.fn();
    buffer.subscribe(second);

    expect(first).toHaveBeenCalledWith('live.charui');
    expect(second).toHaveBeenCalledWith('between-subscribers.charui');
  });
});
