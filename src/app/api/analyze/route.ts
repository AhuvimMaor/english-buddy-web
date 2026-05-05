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

const SYSTEM_PROMPT = `You are an English language tutor for Hebrew speakers. You will receive a transcription of a conversation where the user was practicing English.

Analyze the transcription and produce a JSON report with:
1. grammarMistakes: array of {original, corrected, explanation}
   - Identify grammatical errors in the English portions
   - Provide the corrected version and a brief explanation of the rule
2. hebrewWords: array of {hebrew, english, context}
   - Identify any Hebrew words the user used (they couldn't find the English word)
   - Provide the English translation and the sentence context
3. fluencyScore: number 1-10 rating of overall fluency
4. summary: 2-3 sentences of overall feedback, encouraging tone
5. tips: array of 3 actionable suggestions for improvement

Output valid JSON only. No markdown, no code fences.`;

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

    await callRef.update({ analysisStatus: 'transcribing' });

    let transcription: string;

    if (callData.recordingPath) {
      try {
        const bucket = require('firebase-admin/storage').getStorage().bucket(`${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'english-buddy-431f9'}.firebasestorage.app`);
        const file = bucket.file(callData.recordingPath);
        const [buffer] = await file.download();
        const ext = callData.recordingPath.split('.').pop() || 'webm';
        const mimeMap: Record<string, string> = { webm: 'audio/webm', mp3: 'audio/mpeg', mp4: 'audio/mp4', ogg: 'audio/ogg', m4a: 'audio/mp4' };
        const audioFile = new File([buffer], `audio.${ext}`, { type: mimeMap[ext] || 'audio/webm' });
        const result = await getOpenAI().audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
        });
        transcription = result.text;
      } catch (e: any) {
        console.error('Transcription failed:', e.message);
        await callRef.update({ analysisStatus: 'failed' });
        return NextResponse.json({ error: 'Transcription failed: ' + e.message }, { status: 500 });
      }
    } else {
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'No recording found for this call' }, { status: 400 });
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
          content: `Analyze this conversation transcription for user "${callerName}". Focus on their English usage:\n\n${transcription}`,
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

