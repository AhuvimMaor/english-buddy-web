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

async function transcribeFile(bucket: any, path: string): Promise<string> {
  const file = bucket.file(path);
  const [buffer] = await file.download();
  const ext = path.split('.').pop() || 'webm';
  const { toFile } = require('openai/uploads');
  const audioFile = await toFile(Buffer.from(buffer), `audio.${ext}`);
  const result = await getOpenAI().audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
  });
  return result.text;
}

const SYSTEM_PROMPT = `You are an English language tutor for Hebrew speakers. You will receive a transcription of a conversation with CLEAR speaker labels:
- [USER]: is the Hebrew speaker who is LEARNING English
- [PARTNER]: is the conversation partner helping them practice

Produce a JSON report with:

1. transcript: array of {speaker: "user"|"partner", text: string, correction: string|null, correctionExplanation: string|null}
   - Include EVERY line exactly as transcribed
   - Keep the speaker labels as given ([USER] = "user", [PARTNER] = "partner")
   - For user lines with English grammar errors: provide correction and brief explanation
   - For user lines that are entirely in Hebrew: provide the English translation as the correction
   - For correct user lines and ALL partner lines: correction must be null
   - Do NOT add lines that weren't in the transcription

2. grammarMistakes: array of {original, corrected, explanation}
   - Only ENGLISH grammar mistakes from USER's lines
   - Not Hebrew words/sentences

3. hebrewWords: array of {hebrew, english, context}
   - Hebrew words/phrases the user said
   - "hebrew" field MUST be in Hebrew letters (תודה not "toda", כן not "ken")
   - If transcribed in Latin letters, convert to Hebrew script
   - Provide English translation

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

    if (!callData.recordingPath) {
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'No recording found' }, { status: 400 });
    }

    await callRef.update({ analysisStatus: 'transcribing' });

    const bucket = require('firebase-admin/storage').getStorage().bucket(
      `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'english-buddy-431f9'}.firebasestorage.app`
    );

    let transcription: string;

    try {
      const userTranscript = await transcribeFile(bucket, callData.recordingPath);

      let partnerTranscript = '';
      if (callData.partnerRecordingPath) {
        partnerTranscript = await transcribeFile(bucket, callData.partnerRecordingPath);
      }

      if (partnerTranscript) {
        transcription = `[USER]: ${userTranscript}\n\n[PARTNER]: ${partnerTranscript}`;
      } else {
        transcription = `[USER]: ${userTranscript}`;
      }
    } catch (e: any) {
      console.error('Transcription failed:', e.message);
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'Transcription failed: ' + e.message }, { status: 500 });
    }

    await callRef.update({ transcription });
    await callRef.update({ analysisStatus: 'analyzing' });

    const callerDoc = await db.collection('users').doc(callData.callerId).get();
    const callerName = callerDoc.data()?.displayName || 'User';

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analyze this conversation. The user's name is "${callerName}":\n\n${transcription}`,
        },
      ],
    });

    const analysis = JSON.parse(completion.choices[0].message.content || '{}');

    const userIds = [callData.callerId, callData.calleeId];
    for (const userId of userIds) {
      const partnerId = userId === callData.callerId ? callData.calleeId : callData.callerId;
      await db.collection('reports').add({
        callId,
        userId,
        partnerId,
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

    await callRef.update({ analysisStatus: 'complete' });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
