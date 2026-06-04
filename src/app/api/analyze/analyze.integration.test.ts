// Integration test for the analyze route's storage-loading layer, run against
// the Firebase Storage + Firestore emulators.
//
//   npm run test:integration
//
// Requirements: the Firebase emulators (which need a Java runtime) and the
// firebase CLI. This is intentionally excluded from the default `npm test`
// (see the "*.integration.test.ts" exclude) because it needs the emulators.
//
// It exercises the REAL exported route functions (loadChunked) plus the shared
// resolveRecording helper, proving: chunk ordering via getFiles, byte-correct
// concatenation, tolerance of a missing slice, and the single-file fallback.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveRecording, chunkObjectPath, chunkPrefix } from '@/lib/recording';
import { loadChunked } from './route';

const PROJECT_ID = 'demo-english-buddy';
const BUCKET = `${PROJECT_ID}.appspot.com`;

// firebase-admin reads these to target the emulators.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180';
process.env.FIREBASE_STORAGE_EMULATOR_HOST =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';

let app: App;
let bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>;

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET }, 'analyze-integration');
  bucket = getStorage(app).bucket(BUCKET);
});

afterAll(async () => {
  await deleteApp(app);
});

async function upload(path: string, data: string) {
  await bucket.file(path).save(Buffer.from(data));
}

describe('loadChunked (Storage emulator)', () => {
  it('concatenates chunks in index order regardless of upload order', async () => {
    const callId = 'itest-order';
    const uid = 'userA';
    // Upload out of order on purpose.
    await upload(chunkObjectPath(callId, uid, 2, 'webm'), 'CC');
    await upload(chunkObjectPath(callId, uid, 0, 'webm'), 'AA');
    await upload(chunkObjectPath(callId, uid, 1, 'webm'), 'BB');

    const { buffer, ext } = await loadChunked(bucket, chunkPrefix(callId, uid));
    expect(buffer.toString()).toBe('AABBCC');
    expect(ext).toBe('webm');
  });

  it('tolerates a missing middle slice (tab-close robustness)', async () => {
    const callId = 'itest-gap';
    const uid = 'userB';
    await upload(chunkObjectPath(callId, uid, 0, 'webm'), 'AA');
    // index 1 intentionally missing
    await upload(chunkObjectPath(callId, uid, 2, 'webm'), 'CC');

    const { buffer } = await loadChunked(bucket, chunkPrefix(callId, uid));
    expect(buffer.toString()).toBe('AACC');
  });

  it('throws when no chunk files exist', async () => {
    await expect(loadChunked(bucket, chunkPrefix('itest-empty', 'nobody'))).rejects.toThrow();
  });
});

describe('resolveRecording against a real Firestore doc', () => {
  it('resolves chunked from a seeded call doc', async () => {
    const db = getFirestore(app);
    const callId = 'itest-doc';
    const uid = 'userC';
    await db.collection('calls').doc(callId).set({
      callerId: uid,
      [`recordingChunkPrefix_${uid}`]: chunkPrefix(callId, uid),
      [`recordingChunkCount_${uid}`]: 3,
      [`recordingMime_${uid}`]: 'audio/webm;codecs=opus',
    });

    const data = (await db.collection('calls').doc(callId).get()).data()!;
    const res = resolveRecording(data, uid);
    expect(res.kind).toBe('chunked');
    if (res.kind === 'chunked') {
      expect(res.prefix).toBe(chunkPrefix(callId, uid));
      expect(res.count).toBe(3);
    }
  });

  it('falls back to a single legacy file and reads it', async () => {
    const callId = 'itest-single';
    const uid = 'userD';
    const path = `recordings/${callId}/${uid}.webm`;
    await upload(path, 'SINGLE');

    const data = { [`recording_${uid}`]: path };
    const res = resolveRecording(data, uid);
    expect(res).toEqual({ kind: 'single', path });

    const [buf] = await bucket.file(path).download();
    expect(buf.toString()).toBe('SINGLE');
  });
});
