// REAL end-to-end: a recorded conversation -> emulator Storage -> the real
// /api/analyze handler -> real Whisper + GPT-4o -> a real report. This is the
// "true quality check" flavor. It costs a few cents and needs:
//
//   - the Firebase emulators (firestore + storage) running, which need Java
//   - OPENAI_API_KEY set
//   - E2E_AUDIO pointing at a real recording (e.g. one pulled from your bucket).
//     Optionally E2E_AUDIO_2 for a second per-speaker file; otherwise the single
//     E2E_AUDIO is used as a single-file recording.
//
// Run it (excluded from `npm test` because it matches *.integration.test.ts):
//
//   OPENAI_API_KEY=sk-... E2E_AUDIO=/path/to/call.webm npm run test:e2e:real
//
// The npm script wraps this in `firebase emulators:exec` and sets the emulator
// envs. If E2E_AUDIO / OPENAI_API_KEY are missing it skips, so it never fails CI.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { chunkObjectPath, chunkPrefix } from '@/lib/recording';
import { sliceBuffer } from './__fixtures__/audioFixtures';

const PROJECT_ID = 'demo-english-buddy';
const BUCKET = `${PROJECT_ID}.firebasestorage.app`;
const AUDIO = process.env.E2E_AUDIO;
const AUDIO_2 = process.env.E2E_AUDIO_2;
const HAVE_KEY = !!process.env.OPENAI_API_KEY;
const enabled = !!AUDIO && HAVE_KEY;

// The route reads these to target the emulator project and bucket name.
process.env.NEXT_PUBLIC_USE_EMULATORS = 'true';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180';
process.env.FIREBASE_STORAGE_EMULATOR_HOST =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';

let app: App;

beforeAll(() => {
  if (!enabled) return;
  app = initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET }, 'analyze-real');
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe.skipIf(!enabled)('analyze pipeline (REAL audio + REAL OpenAI)', () => {
  it('produces a report for a real recorded conversation', async () => {
    const bucket = getStorage(app).bucket(BUCKET);
    const db = getFirestore(app);

    const callId = `real-${process.env.E2E_RUN_ID || 'manual'}`;
    const callerId = 'realCaller';
    const calleeId = 'realCallee';

    const ext = (AUDIO!.split('.').pop() || 'webm').toLowerCase();
    const callerBuf = readFileSync(AUDIO!);
    const calleeBuf = AUDIO_2 ? readFileSync(AUDIO_2) : null;

    // Upload the caller recording as chunks (proves the chunked path on real audio).
    const callerSlices = sliceBuffer(callerBuf, 4);
    await Promise.all(
      callerSlices.map((b, i) => bucket.file(chunkObjectPath(callId, callerId, i, ext)).save(b))
    );

    const callDoc: Record<string, unknown> = {
      callerId,
      calleeId,
      durationSeconds: 90,
      analysisStatus: 'pending',
      [`recordingChunkPrefix_${callerId}`]: chunkPrefix(callId, callerId),
      [`recordingChunkCount_${callerId}`]: callerSlices.length,
      [`recordingMime_${callerId}`]: `audio/${ext}`,
    };

    if (calleeBuf) {
      const calleeSlices = sliceBuffer(calleeBuf, 4);
      await Promise.all(
        calleeSlices.map((b, i) => bucket.file(chunkObjectPath(callId, calleeId, i, ext)).save(b))
      );
      callDoc[`recordingChunkPrefix_${calleeId}`] = chunkPrefix(callId, calleeId);
      callDoc[`recordingChunkCount_${calleeId}`] = calleeSlices.length;
      callDoc[`recordingMime_${calleeId}`] = `audio/${ext}`;
    }

    await db.collection('calls').doc(callId).set(callDoc);
    await db.collection('users').doc(callerId).set({ displayName: 'Real Caller' });
    await db.collection('users').doc(calleeId).set({ displayName: 'Real Callee' });

    // Import the handler lazily so the emulator env is set first.
    const { POST } = await import('./route');
    const req = {
      json: async () => ({ callId, force: true }),
      nextUrl: { searchParams: { get: () => null } },
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(200);

    const call = (await db.collection('calls').doc(callId).get()).data()!;
    expect(call.analysisStatus).toBe('complete');
    expect(typeof call.transcription).toBe('string');
    expect(call.transcription.length).toBeGreaterThan(0);

    const reports = (await db.collection('reports').where('callId', '==', callId).get()).docs.map((d) =>
      d.data()
    );
    expect(reports.length).toBeGreaterThanOrEqual(1);

    // Surface the result so you can eyeball transcription/scoring quality.
    console.log('\n===== REAL ANALYZE RESULT =====');
    console.log('Transcription:\n', call.transcription);
    for (const r of reports) {
      console.log(`\n[report for ${r.userId}] fluency=${r.fluencyScore}`);
      console.log('summary:', r.summary);
      console.log('grammarMistakes:', JSON.stringify(r.grammarMistakes, null, 2));
      console.log('hebrewWords:', JSON.stringify(r.hebrewWords, null, 2));
    }
    console.log('===============================\n');
  }, 180_000); // real transcription + analysis can take a couple of minutes
});
