import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

async function transcribeWithElevenLabs(bucket: any, path: string): Promise<string> {
  const file = bucket.file(path);
  const [buffer] = await file.download();

  const formData = new FormData();
  const ext = path.split('.').pop() || 'webm';
  const blob = new Blob([buffer], { type: ext === 'mp4' || ext === 'm4a' ? 'audio/mp4' : 'audio/webm' });
  formData.append('file', blob, `audio.${ext}`);
  formData.append('model_id', 'scribe_v1');
  formData.append('diarize', 'true');
  formData.append('tag_audio_events', 'false');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs STT failed (${response.status}): ${err}`);
  }

  const data = await response.json();

  // Build transcript with speaker labels
  let result = '';
  let lastSpeaker = '';

  if (data.words && data.words.length > 0) {
    for (const word of data.words) {
      const speaker = word.speaker_id || 'unknown';
      if (speaker !== lastSpeaker) {
        if (result) result = result.trimEnd() + '\n';
        result += `[Speaker ${speaker}]: `;
        lastSpeaker = speaker;
      }
      const text = (word.text || '').trim();
      if (text) result += text + ' ';
    }
  } else if (data.text) {
    result = data.text;
  }

  return result.trim();
}

const SYSTEM_PROMPT = `You are an English language tutor for Hebrew speakers. You will receive a transcription of a conversation with speaker labels (Speaker 1, Speaker 2, etc).

IMPORTANT RULES:
- Identify which speaker is the LEARNER (uses Hebrew words, makes grammar mistakes, less fluent) and which is the PARTNER (more fluent, helps/corrects)
- Label the learner as "user" and the helper as "partner" in your output
- The transcription has real speaker diarization - trust the speaker labels for who said what

Produce a JSON report with:

1. transcript: array of {speaker: "user"|"partner", text: string, corrections: array|null}
   - IMPORTANT: Break each speaker's text into INDIVIDUAL SENTENCES. Each sentence = separate entry.
   - Alternate between speakers to recreate natural conversation flow
   - Map the learner to "user" and helper to "partner"
   - IMPORTANT: When user mixes Hebrew words within English, keep them INLINE using Hebrew letters
   - "corrections" is an array of {wrong: string, right: string, explanation: string} - ONLY the specific wrong word/phrase
   - For Hebrew words inline: {wrong: "מצגת", right: "presentation", explanation: "Hebrew word"}
   - For grammar errors: {wrong: "more better", right: "better", explanation: "comparative form"}
   - For correct lines or partner lines: corrections should be null or empty array

2. grammarMistakes: array of {original, corrected, explanation}
   - Only ENGLISH grammar mistakes from the learner

3. hebrewWords: array of {hebrew, english, context}
   - "hebrew" MUST be in Hebrew letters (תודה not "toda")
   - Convert transliterated Hebrew to Hebrew script

4. fluencyScore: number 1-10

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
    const callerId = callData.callerId;
    const calleeId = callData.calleeId;

    // Find recordings
    const callerRecording = callData[`recording_${callerId}`] || callData.recordingPath || null;
    const calleeRecording = callData[`recording_${calleeId}`] || callData.partnerRecordingPath || null;

    if (!callerRecording && !calleeRecording) {
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'No recording found' }, { status: 400 });
    }

    await callRef.update({ analysisStatus: 'transcribing' });

    const bucket = require('firebase-admin/storage').getStorage().bucket(
      `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'english-buddy-431f9'}.firebasestorage.app`
    );

    let transcription: string;

    try {
      // Prefer caller recording (usually has both voices via speaker/mic bleed)
      // If both exist, transcribe both and combine
      if (callerRecording && calleeRecording) {
        const callerTranscript = await transcribeWithElevenLabs(bucket, callerRecording);
        const calleeTranscript = await transcribeWithElevenLabs(bucket, calleeRecording);
        transcription = `--- Caller's mic ---\n${callerTranscript}\n\n--- Callee's mic ---\n${calleeTranscript}`;
      } else {
        const recording = callerRecording || calleeRecording;
        transcription = await transcribeWithElevenLabs(bucket, recording!);
      }
    } catch (e: any) {
      console.error('Transcription failed:', e.message);
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'Transcription failed: ' + e.message }, { status: 500 });
    }

    await callRef.update({ transcription });
    await callRef.update({ analysisStatus: 'analyzing' });

    const callerDoc = await db.collection('users').doc(callerId).get();
    const calleeDoc = await db.collection('users').doc(calleeId).get();
    const callerName = callerDoc.data()?.displayName || 'User';
    const calleeName = calleeDoc.data()?.displayName || 'Partner';

    // Analyze each speaker separately
    const participants = [
      { userId: callerId, partnerId: calleeId, name: callerName, role: 'caller' },
      { userId: calleeId, partnerId: callerId, name: calleeName, role: 'callee' },
    ];

    for (const participant of participants) {
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
    }

    // Update call stats
    const durationMinutes = (callData.durationSeconds || 0) / 60;
    const { FieldValue } = require('firebase-admin/firestore');
    for (const uid of [callerId, calleeId]) {
      try {
        await db.collection('users').doc(uid).update({
          callCount: FieldValue.increment(1),
          totalCallMinutes: FieldValue.increment(durationMinutes),
        });
      } catch (e) {
        console.error(`Failed to update stats for ${uid}:`, e);
      }
    }

    await callRef.update({ analysisStatus: 'complete' });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
