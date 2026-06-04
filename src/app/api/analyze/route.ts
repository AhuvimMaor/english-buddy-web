import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

async function transcribeSegmentsWithOpenAI(bucket: any, path: string): Promise<TranscriptSegment[]> {
  const file = bucket.file(path);
  const [buffer] = await file.download();

  const ext = path.split('.').pop() || 'webm';
  const audioFile = await toFile(buffer, `audio.${ext}`);

  const openai = getOpenAI();
  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    prompt: 'This is an English conversation that might contain mixed Hebrew words like shalom, beseder, sababa, etc.',
  }) as any;

  return (response.segments || [{ start: 0, end: 0, text: response.text }]).map((seg: any) => ({
    start: seg.start || 0,
    end: seg.end || 0,
    text: seg.text.trim()
  }));
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
   - IMPORTANT: Break each speaker's text into INDIVIDUAL SENTENCES. Each sentence = separate entry.
   - Alternate between speakers to recreate natural conversation flow
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
    const { callId } = await req.json();
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
    
    // Prevent double execution
    if (callData.analysisStatus === 'transcribing' || callData.analysisStatus === 'analyzing' || callData.analysisStatus === 'complete') {
      return NextResponse.json({ success: true, message: 'Already processing' }, { status: 200 });
    }
    
    const callerId = callData.callerId;
    const calleeId = callData.calleeId;

    // Find recordings
    const callerRecording = callData[`recording_${callerId}`] || callData.recordingPath || null;
    const calleeRecording = callData[`recording_${calleeId}`] || callData.partnerRecordingPath || null;

    const force = req.nextUrl?.searchParams?.get('force') === 'true' || (await req.clone().json().catch(()=>({}))).force;

    if (!callerRecording && !calleeRecording) {
      return NextResponse.json({ error: 'No recording found yet' }, { status: 400 });
    }

    if ((!callerRecording || !calleeRecording) && !force) {
      // One is missing, wait for the other to upload before starting analysis
      return NextResponse.json({ success: true, message: 'Waiting for partner recording' }, { status: 200 });
    }

    // Try an atomic update to lock the analysis process
    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(callRef);
        const data = doc.data()!;
        if (data.analysisStatus === 'transcribing' || data.analysisStatus === 'analyzing' || data.analysisStatus === 'complete') {
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

    const bucket = require('firebase-admin/storage').getStorage().bucket(
      `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'english-buddy-431f9'}.firebasestorage.app`
    );

    // Get user names for labeling
    const callerNameForLabel = (await db.collection('users').doc(callerId).get()).data()?.displayName || 'Caller';
    const calleeNameForLabel = (await db.collection('users').doc(calleeId).get()).data()?.displayName || 'Callee';

    let transcription: string;

    try {
      if (callerRecording && calleeRecording) {
        // BEST: Per-speaker recordings - each person's clean mic audio
        // Parallelize transcription
        const [callerSegments, calleeSegments] = await Promise.all([
          transcribeSegmentsWithOpenAI(bucket, callerRecording),
          transcribeSegmentsWithOpenAI(bucket, calleeRecording)
        ]);

        // Combine and sort chronologically by start time
        const combinedSegments = [
          ...callerSegments.map(seg => ({ ...seg, speaker: callerNameForLabel })),
          ...calleeSegments.map(seg => ({ ...seg, speaker: calleeNameForLabel }))
        ];
        
        combinedSegments.sort((a, b) => a.start - b.start);
        transcription = combinedSegments.map(seg => `[${seg.speaker}]: ${seg.text}`).join('\n');
      } else {
        // Fallback: single recording
        const recording = callerRecording || calleeRecording;
        const segments = await transcribeSegmentsWithOpenAI(bucket, recording!);
        transcription = segments.map(seg => seg.text).join('\n');
      }
    } catch (e: any) {
      console.error('Transcription failed:', e.message);
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'Transcription failed: ' + e.message }, { status: 500 });
    }

    await callRef.update({ transcription });
    await callRef.update({ analysisStatus: 'analyzing' });

    const callerName = (await db.collection('users').doc(callerId).get()).data()?.displayName || 'User';
    const calleeName = (await db.collection('users').doc(calleeId).get()).data()?.displayName || 'Partner';

    // Analyze each speaker separately
    const participants = [
      { userId: callerId, partnerId: calleeId, name: callerName, role: 'caller' },
      { userId: calleeId, partnerId: callerId, name: calleeName, role: 'callee' },
    ];

    // Parallelize LLM analysis and report creation
    await Promise.all(participants.map(async (participant) => {
      try {
        const completion = await getOpenAI().chat.completions.create({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Analyze this conversation for "${participant.name}" (the ${participant.role}). Find THEIR grammar mistakes, Hebrew words, and score THEIR fluency. Show the full conversation but corrections only for their lines.\n\n${transcription}`,
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
      } catch (err) {
        console.error(`Failed analysis for ${participant.name}:`, err);
      }
    }));

    // Update call stats
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

    await callRef.update({ analysisStatus: 'complete' });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
