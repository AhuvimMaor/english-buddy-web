import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry';

const noSleep = async () => {};

describe('withRetry', () => {
  it('returns the first successful result', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until it succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValue('ok');
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after all attempts fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow('nope');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('backs off exponentially between attempts', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    await withRetry(fn, { attempts: 4, baseDelayMs: 100, sleep }).catch(() => {});
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200, 400]);
  });
});
