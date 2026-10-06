import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, resetRateLimits } from './rateLimit';

beforeEach(() => resetRateLimits());

describe('rateLimit', () => {
  it('allows up to max hits per window then blocks', () => {
    expect([1, 2, 3].map(() => rateLimit('u', 3, 1000, 0))).toEqual([true, true, true]);
    expect(rateLimit('u', 3, 1000, 10)).toBe(false);
  });
  it('frees up after the window passes', () => {
    for (let i = 0; i < 3; i++) rateLimit('u', 3, 1000, 0);
    expect(rateLimit('u', 3, 1000, 1500)).toBe(true);
  });
  it('tracks keys independently', () => {
    rateLimit('a', 1, 1000, 0);
    expect(rateLimit('b', 1, 1000, 0)).toBe(true);
  });
});
