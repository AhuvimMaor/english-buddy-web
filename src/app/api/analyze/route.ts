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
    model: 'gpt-4o-transcribe',
  });
  return result.text || '';
}

const SYSTEM_PROMPT = `You are an English language tutor for Hebrew speakers. You will receive a transcription of a conversation with CLEAR speaker labels:
- [USER]: is the Hebrew speaker who is LEARNING English
- [PARTNER]: is the conversation partner helping them practice

Produce a JSON report with:

1. transcript: array of {speaker: "user"|"partner", text: string, corrections: array|null}
   - IMPORTANT: Break each speaker's text into INDIVIDUAL SENTENCES. Do NOT put all of one speaker's text in one line.
   - Each sentence or thought should be its own transcript entry
   - If a speaker says 5 sentences, create 5 separate transcript entries for them
   - Alternate between speakers to recreate the natural conversation flow
   - Keep the speaker labels as given ([USER] = "user", [PARTNER] = "partner")
   - IMPORTANT: When user mixes Hebrew words within an English sentence, keep them INLINE in the text field using Hebrew letters
   - Example: text="I don't know how to לדבר English good"
   - Example: text="Yesterday I had a מצגת at work"
   - If Whisper transcribed Hebrew as Latin (e.g. "ledaber"), convert to Hebrew letters in the text
   - "corrections" is an array of {wrong: string, right: string, explanation: string} - ONLY the specific word or short phrase that is wrong, NOT the whole sentence
   - For Hebrew words inline, the correction should provide the English word: {wrong: "לדבר", right: "speak", explanation: "Hebrew word - English equivalent is 'speak'"}
   - Example: text="I'm doing this for three years", corrections=[{wrong: "I'm doing", right: "I've been doing", explanation: "present perfect continuous for ongoing actions"}]
   - Example: text="it was very excited", corrections=[{wrong: "excited", right: "exciting", explanation: "use -ing for things that cause the feeling"}]
   - Example: text="I need to do a מצגת tomorrow", corrections=[{wrong: "מצגת", right: "presentation", explanation: "Hebrew word"}]
   - For correct lines or partner lines: corrections should be null or empty array
   - Do NOT repeat the whole sentence in the correction, only the specific words

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

    const callerId = callData.callerId;
    const calleeId = callData.calleeId;

    // Find recordings - new format: recording_{userId}, old format: recordingPath/partnerRecordingPath
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
      let callerText = '';
      let calleeText = '';

      if (callerRecording) {
        callerText = await transcribeFile(bucket, callerRecording);
      }
      if (calleeRecording) {
        calleeText = await transcribeFile(bucket, calleeRecording);
      }

      if (callerText && calleeText) {
        transcription = `[USER]: ${callerText}\n\n[PARTNER]: ${calleeText}`;
      } else if (callerText) {
        transcription = `[USER]: ${callerText}`;
      } else {
        transcription = `[PARTNER]: ${calleeText}`;
      }
    } catch (e: any) {
      console.error('Transcription failed:', e.message);
      await callRef.update({ analysisStatus: 'failed' });
      return NextResponse.json({ error: 'Transcription failed: ' + e.message }, { status: 500 });
    }

    await callRef.update({ transcription });
    await callRef.update({ analysisStatus: 'analyzing' });

    const callerDoc = await db.collection('users').doc(callData.callerId).get();
    const calleeDoc = await db.collection('users').doc(callData.calleeId).get();
    const callerName = callerDoc.data()?.displayName || 'User';
    const calleeName = calleeDoc.data()?.displayName || 'Partner';

    // Analyze each speaker separately - each gets their own personalized report
    const participants = [
      { userId: callData.callerId, partnerId: callData.calleeId, name: callerName, speakerLabel: 'USER', partnerLabel: 'PARTNER' },
      { userId: callData.calleeId, partnerId: callData.callerId, name: calleeName, speakerLabel: 'PARTNER', partnerLabel: 'USER' },
    ];

    for (const participant of participants) {
      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Analyze this conversation for "${participant.name}". Their lines are labeled [${participant.speakerLabel}]. Analyze ONLY their English - find grammar mistakes, Hebrew words, and score THEIR fluency. The other speaker [${participant.partnerLabel}] is their conversation partner.\n\n${transcription}`,
          },
        ],
      });

      const analysis = JSON.parse(completion.choices[0].message.content || '{}');
      const transcript = (analysis.transcript || []).map((line: any) => {
        // Flip labels so "user" always means the person viewing the report
        if (participant.speakerLabel === 'PARTNER') {
          return { ...line, speaker: line.speaker === 'user' ? 'partner' : 'user' };
        }
        return line;
      });

      await db.collection('reports').add({
        callId,
        userId: participant.userId,
        partnerId: participant.partnerId,
        callDuration: callData.durationSeconds || 0,
        transcript,
        grammarMistakes: analysis.grammarMistakes || [],
        hebrewWords: analysis.hebrewWords || [],
        fluencyScore: analysis.fluencyScore || null,
        summary: analysis.summary || '',
        tips: analysis.tips || [],
        createdAt: new Date(),
      });
    }

    // Update call stats for both users
    const durationMinutes = (callData.durationSeconds || 0) / 60;
    const { FieldValue } = require('firebase-admin/firestore');
    for (const uid of [callData.callerId, callData.calleeId]) {
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
