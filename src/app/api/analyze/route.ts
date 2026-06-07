import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  resolveRecording,
  sortChunkFilesByIndex,
  WHISPER_MAX_BYTES,
  type ResolvedRecording,
} from '@/lib/recording';

export const maxDuration = 300; // Allow up to 5 minutes on Vercel

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getAdminDb() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
      const decoded = serviceAccount.startsWith('{')
        ? serviceAccount
        : Buffer.from(serviceAccount, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      initializeApp({ credential: cert(parsed) });
    } else if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true') {
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
      initializeApp({ projectId: 'demo-english-buddy' });
    } else {
      initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '' });
    }
  }
  return getFirestore();
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

async function transcribeBuffer(buffer: Buffer, ext: string): Promise<TranscriptSegment[]> {
  if (buffer.length > WHISPER_MAX_BYTES) {
    throw new Error(`Recording exceeds Whisper ${WHISPER_MAX_BYTES} byte limit (${buffer.length})`);
  }

  const audioFile = await toFile(buffer, `audio.${ext}`);

  const openai = getOpenAI();
  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    // Force English. This is an English-learning app: without it Whisper
    // auto-detects one language per track, picks Hebrew on accented/mixed
    // speech, and drops most of the spoken English. Hebrew words spoken inside
    // English are still captured inline; the tutor prompt converts them.
    language: 'en',
    prompt: 'This is an English conversation that might contain mixed Hebrew words like shalom, beseder, sababa, etc.',
  }) as any;

  return (response.segments || [{ start: 0, end: 0, text: response.text }]).map((seg: any) => ({
    start: seg.start || 0,
    end: seg.end || 0,
    text: seg.text.trim()
  }));
}

// Download a single recording file.
async function loadSingle(bucket: any, path: string): Promise<{ buffer: Buffer; ext: string }> {
  const [buffer] = await bucket.file(path).download();
  return { buffer, ext: path.split('.').pop() || 'webm' };
}

// Download all chunk slices for one speaker and concatenate them in order.
// Listing (not the stored count) is authoritative, so a lost final slice on a
// tab-close is tolerated. Concatenating ordered same-session slices is
// byte-identical to the client's new Blob(localChunks).
export async function loadChunked(bucket: any, prefix: string): Promise<{ buffer: Buffer; ext: string }> {
  const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
  const ordered = sortChunkFilesByIndex(files.map((f: any) => f.name));
  if (ordered.length === 0) {
    throw new Error(`No chunk files found for ${prefix}`);
  }
  const buffers: Buffer[] = await Promise.all(
    ordered.map((name) => bucket.file(name).download().then(([b]: [Buffer]) => b))
  );
  const ext = ordered[0].split('.').pop() || 'webm';
  return { buffer: Buffer.concat(buffers), ext };
}

// Load a speaker's audio buffer regardless of storage layout (chunked or single).
async function loadRecording(bucket: any, res: ResolvedRecording): Promise<{ buffer: Buffer; ext: string }> {
  if (res.kind === 'chunked') return loadChunked(bucket, res.prefix);
  if (res.kind === 'single') return loadSingle(bucket, res.path);
  throw new Error('No recording to load');
}

const SYSTEM_PROMPT = `You are an English language tutor for Hebrew speakers. You will receive a transcription of a conversation with speaker labels (Speaker 1, Speaker 2, etc).
Note: The transcription might be slightly inaccurate or phonetic if the speakers mixed Hebrew and English, because the STT model might try to transcribe Hebrew words with English letters.

IMPORTANT RULES:
- Identify which speaker is the LEARNER (uses Hebrew words, makes grammar mistakes, less fluent) and which is the PARTNER (more fluent, helps/corrects)
- Label the learner as "user" and the helper as "partner" in your output
- The transcription has real speaker diarization - trust the speaker labels for who said what
- If you see gibberish English that sounds like Hebrew (e.g., "ma kore", "beseder", "toda"), interpret it as Hebrew.
- CRITICAL: Do NOT just translate Hebrew words. You MUST actively identify and correct poor English grammar, wrong syntax, incorrect verb tenses, awkward phrasing, and missing prepositions (e.g., "I am going to home" -> "I am going home", "I didn't went" -> "I didn't go"). 

Produce a JSON report with:

1. transcript: array of {speaker: "user"|"partner", text: string, corrections: array|null}
   - CRITICAL: DO NOT GROUP BY SPEAKER. You MUST maintain the EXACT chronological, alternating order of the original conversation.
   - Break each speaker's text into INDIVIDUAL SENTENCES. Each sentence = separate entry.
   - Alternate between speakers exactly as they spoke to recreate the natural back-and-forth conversation flow.
   - Map the learner to "user" and helper to "partner"
   - IMPORTANT: When user mixes Hebrew words within English, keep them INLINE using Hebrew letters
   - "corrections" is an array of {wrong: string, right: string, explanation: string} - ONLY the specific wrong word/phrase
   - For Hebrew words inline: {wrong: "מצגת", right: "presentation", explanation: "Hebrew word"}
   - For grammar and syntax errors: {wrong: "more better", right: "better", explanation: "grammar/syntax correction"}
   - For correct lines or partner lines: corrections should be null or empty array

2. grammarMistakes: array of {original, corrected, explanation}
   - Must comprehensively capture all ENGLISH grammar mistakes, syntax errors, and awkward phrasings from the learner. DO NOT limit this to just translated Hebrew words.

3. hebrewWords: array of {hebrew, english, context}
   - "hebrew" MUST be in Hebrew letters (תודה not "toda")
   - Convert transliterated Hebrew to Hebrew script

4. fluencyScore: number 1-10
   - CRITICAL: If the learner speaks ONLY or predominantly Hebrew, the fluency score MUST be very low (1, 2, or 3 max) regardless of how fluent their Hebrew is.
   - Do NOT give a score higher than 3 if they don't speak English.
   - Reserve 8-10 ONLY for highly fluent English speakers.

5. summary: 2-3 sentences encouraging feedback

6. tips: array of 3 actionable suggestions

Output valid JSON only.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { callId } = body;
    if (!callId) {
      return NextResponse.json({ error: 'callId required' }, { status: 400 });
    }

    const db = getAdminDb();
    const callRef = db.collection('calls').doc(callId);
    const callDoc = await callRef.get();

    if (!callDoc.exists) {
      return NextResponse.json({ error: 'call not found' }, { status: 404 });
    }

    const callData = callDoc.data()!;

    const force = req.nextUrl?.searchParams?.get('force') === 'true' || body.force === true;
    // Re-run analysis for an already-completed call and replace its reports
    // (e.g. after a transcription fix). Implies force.
    const reprocess = req.nextUrl?.searchParams?.get('reprocess') === 'true' || body.reprocess === true;

    // Prevent double execution. A reprocess is allowed to re-run a 'complete'
    // (or 'failed') call, but never one that is genuinely in flight.
    const inFlight = callData.analysisStatus === 'transcribing' || callData.analysisStatus === 'analyzing';
    if (inFlight || (callData.analysisStatus === 'complete' && !reprocess)) {
      return NextResponse.json({ success: true, message: 'Already processing' }, { status: 200 });
    }

    const callerId = callData.callerId;
    const calleeId = callData.calleeId;

    // Resolve recordings (chunked -> per-speaker single -> legacy fallback).
    const callerRes = resolveRecording(callData, callerId, callData.recordingPath);
    const calleeRes = resolveRecording(callData, calleeId, callData.partnerRecordingPath);
    const callerPresent = callerRes.kind !== 'none';
    const calleePresent = calleeRes.kind !== 'none';

    if (!callerPresent && !calleePresent) {
      return NextResponse.json({ error: 'No recording found yet' }, { status: 400 });
    }

    if ((!callerPresent || !calleePresent) && !force && !reprocess) {
      // One is missing, wait for the other to upload before starting analysis
      return NextResponse.json({ success: true, message: 'Waiting for partner recording' }, { status: 200 });
    }

    // Try an atomic update to lock the analysis process
    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(callRef);
        const data = doc.data()!;
        const dInFlight = data.analysisStatus === 'transcribing' || data.analysisStatus === 'analyzing';
        if (dInFlight || (data.analysisStatus === 'complete' && !reprocess)) {
          throw new Error('ALREADY_PROCESSING');
        }
        t.update(callRef, { analysisStatus: 'transcribing' });
      });
    } catch (e: any) {
      if (e.message === 'ALREADY_PROCESSING') {
        return NextResponse.json({ success: true, message: 'Already processing' }, { status: 200 });
      }
      throw e;
    }

    const bucket = getStorage().bucket(
      `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'english-buddy-431f9'}.firebasestorage.app`
    );

    // Get user names for labeling
    const [callerUserDoc, calleeUserDoc] = await Promise.all([
      db.collection('users').doc(callerId).get(),
      db.collection('users').doc(calleeId).get(),
    ]);
    const callerName = callerUserDoc.data()?.displayName || 'Caller';
    const calleeName = calleeUserDoc.data()?.displayName || 'Callee';

    let transcription: string;

    const transcribeSpeaker = async (res: ResolvedRecording): Promise<TranscriptSegment[]> => {
      const { buffer, ext } = await loadRecording(bucket, res);
      return transcribeBuffer(buffer, ext);
    };

    try {
      if (callerPresent && calleePresent) {
        // BEST: Per-speaker recordings - each person's clean mic audio
        // Parallelize transcription
        const [callerSegments, calleeSegments] = await Promise.all([
          transcribeSpeaker(callerRes),
          transcribeSpeaker(calleeRes)
        ]);

        // Combine and sort chronologically by start time
        const combinedSegments = [
          ...callerSegments.map(seg => ({ ...seg, speaker: callerName })),
          ...calleeSegments.map(seg => ({ ...seg, speaker: calleeName }))
        ];

        combinedSegments.sort((a, b) => a.start - b.start);
        transcription = combinedSegments.map(seg => `[${seg.speaker}]: ${seg.text}`).join('\n');
      } else {
        // Fallback: single recording
        const present = callerPresent ? callerRes : calleeRes;
        const segments = await transcribeSpeaker(present);
        transcription = segments.map(seg => seg.text).join('\n');
      }
    } catch (e: any) {
      console.error('Transcription failed:', e.message);
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'Transcription failed: ' + e.message }, { status: 500 });
    }

    await callRef.update({ transcription, analysisStatus: 'analyzing' });

    // On reprocess, remove the stale reports now (after a successful
    // transcription) so we replace rather than duplicate them.
    if (reprocess) {
      const stale = await db.collection('reports').where('callId', '==', callId).get();
      await Promise.all(stale.docs.map((d: any) => d.ref.delete()));
    }

    // Analyze each speaker separately
    const participants = [
      { userId: callerId, partnerId: calleeId, name: callerName, role: 'caller' },
      { userId: calleeId, partnerId: callerId, name: calleeName, role: 'callee' },
    ];

    // Parallelize LLM analysis and report creation
    const analysisResults = await Promise.all(participants.map(async (participant) => {
      try {
        const completion = await getOpenAI().chat.completions.create({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Analyze this conversation for "${participant.name}" (the ${participant.role}). Find THEIR grammar mistakes, Hebrew words, and score THEIR fluency. Show the FULL, EXACT conversation in its original alternating chronological order (do NOT group lines by speaker). Add corrections only for their lines.\n\n${transcription}`,
            },
          ],
        });

        const analysis = JSON.parse(completion.choices[0].message.content || '{}');

        await db.collection('reports').add({
          callId,
          userId: participant.userId,
          partnerId: participant.partnerId,
          callDuration: callData.durationSeconds || 0,
          transcript: analysis.transcript || [],
          grammarMistakes: analysis.grammarMistakes || [],
          hebrewWords: analysis.hebrewWords || [],
          fluencyScore: analysis.fluencyScore || null,
          summary: analysis.summary || '',
          tips: analysis.tips || [],
          createdAt: new Date(),
        });
        return true;
      } catch (err) {
        console.error(`Failed analysis for ${participant.name}:`, err);
        return false;
      }
    }));

    if (!analysisResults.some(Boolean)) {
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'All analyses failed' }, { status: 500 });
    }

    // Update call stats (skip on reprocess so we don't double-count an
    // already-counted call).
    if (!reprocess) {
      const durationMinutes = (callData.durationSeconds || 0) / 60;
      await Promise.all([callerId, calleeId].map(async (uid) => {
        try {
          await db.collection('users').doc(uid).update({
            callCount: FieldValue.increment(1),
            totalCallMinutes: FieldValue.increment(durationMinutes),
          });
        } catch (e) {
          console.error(`Failed to update stats for ${uid}:`, e);
        }
      }));
    }

    await callRef.update({ analysisStatus: 'complete' });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
