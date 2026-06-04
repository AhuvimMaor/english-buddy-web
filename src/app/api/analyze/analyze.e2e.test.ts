// Full-handler e2e for the analysis pipeline, driven by a "recorded conversation"
// (synthetic bytes here), with OpenAI + firebase-admin mocked. Runs in CI via
// `npm test` — no emulators, no network, no API key. It exercises the REAL POST
// handler: resolveRecording -> loadChunked (getFiles + Buffer.concat) ->
// transcribe -> per-participant analysis -> report writes + status transitions.
//
// The real-audio + real-OpenAI counterpart lives in analyze.real.integration.test.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared in-memory firebase + openai capture, built before the mock factories run.
const h = vi.hoisted(() => {
  const INC = '__inc';
  const data: Record<string, Record<string, any>> = {};
  const files: Record<string, Buffer> = {};
  const transcriptionBuffers: Buffer[] = [];
  let autoId = 0;

  const applyUpdate = (target: any, patch: any) => {
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (v && typeof v === 'object' && INC in v) {
        target[k] = (typeof target[k] === 'number' ? target[k] : 0) + v[INC];
      } else {
        target[k] = v;
      }
    }
  };

  const docRef = (coll: string, id: string) => ({
    id,
    async get() {
      const obj = data[coll]?.[id];
      return { exists: obj !== undefined, data: () => (obj === undefined ? undefined : { ...obj }) };
    },
    async set(obj: any) {
      (data[coll] ??= {})[id] = { ...obj };
    },
    async update(patch: any) {
      const cur = (data[coll] ??= {})[id];
      if (cur === undefined) throw new Error(`No document to update: ${coll}/${id}`);
      applyUpdate(cur, patch);
    },
  });

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(name, id),
      async add(obj: any) {
        const id = `auto_${autoId++}`;
        (data[name] ??= {})[id] = { ...obj };
        return { id };
      },
    }),
    async runTransaction(fn: (t: any) => Promise<any>) {
      const t = {
        get: (ref: any) => ref.get(),
        update: (ref: any, patch: any) => ref.update(patch),
      };
      return fn(t);
    },
    __seed(coll: string, id: string, obj: any) {
      (data[coll] ??= {})[id] = { ...obj };
    },
    __all(coll: string) {
      return Object.values(data[coll] ?? {});
    },
    __reset() {
      for (const k of Object.keys(data)) delete data[k];
      for (const k of Object.keys(files)) delete files[k];
      transcriptionBuffers.length = 0;
    },
  };

  const bucket = {
    file(path: string) {
      return {
        name: path,
        async download() {
          const b = files[path];
          if (!b) throw new Error(`not found: ${path}`);
          return [b];
        },
        async save(buf: Buffer) {
          files[path] = buf;
        },
      };
    },
    async getFiles({ prefix }: { prefix: string }) {
      return [Object.keys(files).filter((p) => p.startsWith(prefix)).map((name) => ({ name }))];
    },
    __put(path: string, buf: Buffer) {
      files[path] = buf;
    },
  };

  return { db, bucket, transcriptionBuffers };
});

const CANNED_REPORT = {
  transcript: [{ speaker: 'user', text: 'Hello my friend', corrections: [] }],
  grammarMistakes: [{ original: 'I go yesterday', corrected: 'I went yesterday', explanation: 'past tense' }],
  hebrewWords: [{ hebrew: 'שלום', english: 'hello', context: 'greeting' }],
  fluencyScore: 6,
  summary: 'Good effort, keep practicing.',
  tips: ['Use past tense', 'Avoid Hebrew fillers', 'Practice prepositions'],
};

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: () => [{}], // non-empty so getAdminDb() skips initialization
  cert: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => h.db,
  FieldValue: { increment: (n: number) => ({ __inc: n }) },
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => h.bucket }),
}));

vi.mock('openai', () => {
  const transcriptions = {
    create: async ({ file }: any) => {
      h.transcriptionBuffers.push(file?.__buf);
      return { segments: [{ start: 0, end: 2, text: 'Hello my friend' }], text: 'Hello my friend' };
    },
  };
  const chat = {
    completions: {
      create: async () => ({ choices: [{ message: { content: JSON.stringify(CANNED_REPORT) } }] }),
    },
  };
  class OpenAIMock {
    audio = { transcriptions };
    chat = chat;
  }
  return { default: OpenAIMock, toFile: async (buf: Buffer, name: string) => ({ __buf: buf, name }) };
});

// Imported AFTER the mocks are declared.
import { POST } from './route';
import { chunkObjectPath, chunkPrefix } from '@/lib/recording';
import { sliceBuffer, makeFakeAudio } from './__fixtures__/audioFixtures';

function makeReq(callId: string, force = false) {
  return {
    json: async () => ({ callId, force }),
    nextUrl: { searchParams: { get: () => null } },
  } as any;
}

beforeEach(() => {
  h.db.__reset();
});

describe('analyze pipeline e2e (recorded conversation, mocked OpenAI)', () => {
  it('transcribes two chunked speakers and writes a report each', async () => {
    const callId = 'call-chunked';
    const callerId = 'userA';
    const calleeId = 'userB';
    const callerAudio = makeFakeAudio('caller');
    const calleeAudio = makeFakeAudio('callee');

    // Slice each "recording" into chunks and upload, out of order to be realistic.
    sliceBuffer(callerAudio, 3).forEach((b, i) =>
      h.bucket.__put(chunkObjectPath(callId, callerId, i, 'webm'), b)
    );
    sliceBuffer(calleeAudio, 4).forEach((b, i) =>
      h.bucket.__put(chunkObjectPath(callId, calleeId, i, 'webm'), b)
    );

    h.db.__seed('calls', callId, {
      callerId,
      calleeId,
      durationSeconds: 120,
      analysisStatus: 'pending',
      [`recordingChunkPrefix_${callerId}`]: chunkPrefix(callId, callerId),
      [`recordingChunkCount_${callerId}`]: 3,
      [`recordingMime_${callerId}`]: 'audio/webm',
      [`recordingChunkPrefix_${calleeId}`]: chunkPrefix(callId, calleeId),
      [`recordingChunkCount_${calleeId}`]: 4,
      [`recordingMime_${calleeId}`]: 'audio/webm',
    });
    h.db.__seed('users', callerId, { displayName: 'Alice' });
    h.db.__seed('users', calleeId, { displayName: 'Bob' });

    const res = await POST(makeReq(callId));
    expect(res.status).toBe(200);

    const call = (await h.db.collection('calls').doc(callId).get()).data();
    expect(call.analysisStatus).toBe('complete');
    expect(call.transcription).toContain('[Alice]:');
    expect(call.transcription).toContain('[Bob]:');

    const reports = h.db.__all('reports');
    expect(reports.length).toBe(2);
    expect(reports.map((r: any) => r.userId).sort()).toEqual([callerId, calleeId]);
    expect(reports[0].fluencyScore).toBe(6);
    expect(reports[0].callDuration).toBe(120);

    // Concatenation correctness: Whisper received exactly the reassembled originals.
    const captured = h.transcriptionBuffers.map((b) => b.toString('hex'));
    expect(captured).toContain(callerAudio.toString('hex'));
    expect(captured).toContain(calleeAudio.toString('hex'));

    // Stats incremented on both users.
    const alice = (await h.db.collection('users').doc(callerId).get()).data();
    expect(alice.callCount).toBe(1);
    expect(alice.totalCallMinutes).toBe(2);
  });

  it('still analyzes a legacy single-file recording (backward compatible)', async () => {
    const callId = 'call-single';
    const uid = 'userC';
    const partnerId = 'userD';
    const path = `recordings/${callId}/${uid}.webm`;
    const audio = makeFakeAudio('single');
    h.bucket.__put(path, audio);

    h.db.__seed('calls', callId, {
      callerId: uid,
      calleeId: partnerId,
      durationSeconds: 60,
      analysisStatus: 'pending',
      [`recording_${uid}`]: path,
    });
    h.db.__seed('users', uid, { displayName: 'Carol' });
    h.db.__seed('users', partnerId, { displayName: 'Dave' });

    // Only one speaker present -> needs force to skip the "waiting for partner" gate.
    const res = await POST(makeReq(callId, true));
    expect(res.status).toBe(200);

    const call = (await h.db.collection('calls').doc(callId).get()).data();
    expect(call.analysisStatus).toBe('complete');
    expect(h.db.__all('reports').length).toBe(2);

    const captured = h.transcriptionBuffers.map((b) => b.toString('hex'));
    expect(captured).toContain(audio.toString('hex'));
  });

  it('returns 400 when no recording exists', async () => {
    const callId = 'call-empty';
    h.db.__seed('calls', callId, { callerId: 'x', calleeId: 'y', analysisStatus: 'pending' });
    const res = await POST(makeReq(callId, true));
    expect(res.status).toBe(400);
  });
});
