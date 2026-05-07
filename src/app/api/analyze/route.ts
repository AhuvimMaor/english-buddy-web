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

const SYSTEM_PROMPT = `You are an English language tutor for Hebrew speakers. You will receive a transcription of a conversation between two people practicing English. The transcription may contain both English and Hebrew text.

IMPORTANT RULES:
- The transcription captures BOTH speakers in one audio stream
- Try to identify speaker changes by context, sentence style, or language switches
- Label one speaker as "user" (the learner) and the other as "partner" (the helper)
- Hebrew text should be identified as words the user couldn't say in English
- Focus corrections ONLY on the user's English grammar, not on their Hebrew

Produce a JSON report with:

1. transcript: array of {speaker: "user"|"partner", text: string, correction: string|null, correctionExplanation: string|null}
   - Include EVERY sentence from the entire conversation
   - Break into individual sentences/phrases by each speaker
   - For user lines with grammar/vocabulary errors: provide corrected English and explanation
   - For correct user lines and all partner lines: correction should be null
   - If user spoke Hebrew, show the Hebrew text and provide English correction/translation

2. grammarMistakes: array of {original, corrected, explanation}
   - Only English grammar errors (not Hebrew words)
   - Explain the rule briefly

3. hebrewWords: array of {hebrew, english, context}
   - Hebrew words/phrases the user used during the conversation
   - IMPORTANT: "hebrew" field MUST be in Hebrew letters (e.g. "תודה רבה" not "Todaraba", "כן" not "Ken", "בסדר" not "beseder")
   - If Whisper transcribed Hebrew as Latin characters, convert back to Hebrew script
   - Provide English translation
   - Include the sentence context where it was used

4. fluencyScore: number 1-10 (1=mostly Hebrew/struggling, 5=mixed with errors, 8=mostly fluent, 10=native-like)

5. summary: 2-3 sentences of encouraging feedback

6. tips: array of 3 specific, actionable suggestions

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
        const storageFile = bucket.file(callData.recordingPath);
        const [buffer] = await storageFile.download();
        const ext = callData.recordingPath.split('.').pop() || 'webm';
        const { toFile } = require('openai/uploads');
        const audioFile = await toFile(Buffer.from(buffer), `audio.${ext}`);
        const result = await getOpenAI().audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          prompt: 'This is a conversation between two people practicing English. One speaker is a native Hebrew speaker who sometimes uses Hebrew words like toda, ken, beseder, yalla, nachon. The conversation is primarily in English with occasional Hebrew.',
          response_format: 'verbose_json',
        });
        transcription = (result as any).text;
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

