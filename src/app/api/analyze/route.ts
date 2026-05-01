import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getAdminDb() {
  if (getApps().length === 0) {
    if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true') {
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
      process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
      initializeApp({ projectId: 'demo-english-buddy' });
    } else {
      initializeApp();
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

    // Step 1: Transcribe
    await callRef.update({ analysisStatus: 'transcribing' });

    let transcription: string;

    if (callData.recordingPath) {
      // Download recording from emulator storage
      try {
        const storageUrl = `http://localhost:9199/v0/b/demo-english-buddy.appspot.com/o/${encodeURIComponent(callData.recordingPath)}?alt=media`;
        const audioResp = await fetch(storageUrl);
        const audioBuffer = await audioResp.arrayBuffer();

        const audioFile = new File(
          [audioBuffer],
          'recording.webm',
          { type: 'audio/webm' },
        );

        const result = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
        });
        transcription = result.text;
      } catch (e) {
        console.error('Transcription from recording failed, using demo:', e);
        transcription = getDemoTranscription();
      }
    } else {
      transcription = getDemoTranscription();
    }

    await callRef.update({ transcription });

    // Step 2: Analyze
    await callRef.update({ analysisStatus: 'analyzing' });

    const callerDoc = await db.collection('users').doc(callData.callerId).get();
    const callerName = callerDoc.data()?.displayName || 'User';

    const completion = await openai.chat.completions.create({
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

    // Create reports for both users
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

function getDemoTranscription(): string {
  return `Speaker 1: Hi, how are you today?
Speaker 2: I'm good, toda raba. I want to talk about my new job.
Speaker 1: That sounds great! What do you do?
Speaker 2: I'm working in the hi-tech, you know, like a programmer. I'm doing this for three years already.
Speaker 1: Oh nice, so you've been doing it for three years.
Speaker 2: Yes, exactly. Sometimes I have difficulty to explain things in English. Like yesterday, I needed to do a mitzuga... how you say... presentation?
Speaker 1: Yes, a presentation!
Speaker 2: Right, I maked a presentation for my team. It was very excited.
Speaker 1: You mean you made a presentation and it was very exciting?
Speaker 2: Ken, yes. Also I don't know how to say tachzit... like the plan for the future?
Speaker 1: A forecast? Or maybe a roadmap?
Speaker 2: Yes! Roadmap! I always forget this word. My manager asked me to prepare the roadmap for next quarter.
Speaker 1: Your English is getting better! Just remember, it's "I've been doing this for three years" not "I'm doing this for three years."
Speaker 2: Toda, thanks! I will try to remember. English is more easy than I thought.
Speaker 1: Easier, not "more easy." But you're doing great!`;
}
