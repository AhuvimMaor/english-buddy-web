import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const captions: any[] = [];
  const calls: Record<string, any> = {
    c1: { callerId: 'userA', calleeId: 'userB' },
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        async get() {
          const d = name === 'calls' ? calls[id] : undefined;
          return { exists: d !== undefined, data: () => d };
        },
        collection: () => ({ add: async (obj: any) => { captions.push(obj); return { id: 'x' }; } }),
      }),
    }),
  };
  return { db, captions, transcript: { text: 'I need מצגת today' } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}], cert: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => h.db, FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      if (t === 'bad') throw new Error('bad');
      return { uid: t };
    },
  }),
}));
vi.mock('openai', () => {
  class OpenAIMock {
    audio = { transcriptions: { create: async () => h.transcript } };
  }
  return { default: OpenAIMock, toFile: async (b: Buffer, name: string) => ({ b, name }) };
});

import { POST } from './route';
import { resetRateLimits } from '@/lib/server/rateLimit';

function makeReq(opts: { token?: string | null; callId?: string; audioSize?: number } = {}) {
  const { token = 'userA', callId = 'c1', audioSize = 1000 } = opts;
  const audio = { size: audioSize, name: 'segment-0.webm', type: 'audio/webm', arrayBuffer: async () => new ArrayBuffer(audioSize) };
  const fields: Record<string, unknown> = { callId, seq: '3', audio };
  return {
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
    formData: async () => ({ get: (k: string) => fields[k] ?? null }),
  } as any;
}

beforeEach(() => {
  h.captions.length = 0;
  h.transcript.text = 'I need מצגת today';
  resetRateLimits();
});

describe('POST /api/live-caption', () => {
  it('stores the caption with its Hebrew words', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(h.captions).toHaveLength(1);
    expect(h.captions[0]).toMatchObject({ from: 'userA', seq: 3, text: 'I need מצגת today', hebrewWords: ['מצגת'] });
  });

  it('requires a valid token', async () => {
    expect((await POST(makeReq({ token: null }))).status).toBe(401);
    expect((await POST(makeReq({ token: 'bad' }))).status).toBe(401);
  });

  it('rejects users who are not in the call', async () => {
    expect((await POST(makeReq({ token: 'stranger' }))).status).toBe(403);
    expect(h.captions).toHaveLength(0);
  });

  it('rejects oversized audio', async () => {
    expect((await POST(makeReq({ audioSize: 3 * 1024 * 1024 }))).status).toBe(413);
  });

  it('drops phantom captions from silence', async () => {
    h.transcript.text = 'Thank you.';
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(h.captions).toHaveLength(0);
  });

  it('rate limits a noisy client', async () => {
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await POST(makeReq())).status;
    expect(last).toBe(429);
  });
});
