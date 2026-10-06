import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/admin';
import { authenticate, isParticipant } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rateLimit';
import { extractHebrewWords, isPhantomCaption } from '@/lib/hebrew';

export const maxDuration = 30;

const MAX_SEGMENT_BYTES = 2 * 1024 * 1024;
const LIVE_MODEL = process.env.LIVE_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

// Unlike the post-call report (which forces English), live captions must keep
// Hebrew words visible, so we leave the language open and steer with a prompt.
const LIVE_PROMPT =
  'An English conversation between a Hebrew speaker who is learning English and a partner. ' +
  'Write English in English. When a speaker says a Hebrew word, write that word in Hebrew letters, for example תודה, סבבה, בסדר.';

function extFromName(name: string, type: string): string {
  const fromName = name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,4}$/.test(fromName)) return fromName;
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

// POST multipart: callId, seq, audio (a short, self-contained audio segment).
// Transcribes it and stores the text in calls/{callId}/captions so that both
// call participants see it live through a Firestore listener.
export async function POST(req: NextRequest) {
  try {
    const caller = await authenticate(req);
    if (!caller?.uid) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!rateLimit(`caption:${caller.uid}`, 30, 60_000)) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }

    const form = await req.formData().catch(() => null);
    const callId = form?.get('callId');
    const seqRaw = form?.get('seq');
    const audio = form?.get('audio');

    if (typeof callId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(callId)) {
      return NextResponse.json({ error: 'callId required' }, { status: 400 });
    }
    if (!audio || typeof audio === 'string') {
      return NextResponse.json({ error: 'audio required' }, { status: 400 });
    }
    if (audio.size === 0 || audio.size > MAX_SEGMENT_BYTES) {
      return NextResponse.json({ error: 'audio size invalid' }, { status: 413 });
    }
    const seq = Number.parseInt(typeof seqRaw === 'string' ? seqRaw : '0', 10);

    const db = getAdminDb();
    const callRef = db.collection('calls').doc(callId);
    const callDoc = await callRef.get();
    if (!callDoc.exists) {
      return NextResponse.json({ error: 'call not found' }, { status: 404 });
    }
    if (!isParticipant(caller, callDoc.data()!)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const file = await toFile(buffer, `segment.${extFromName(audio.name || '', audio.type || '')}`);
    const result = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).audio.transcriptions.create({
      file,
      model: LIVE_MODEL,
      prompt: LIVE_PROMPT,
    });

    const text = (result.text || '').trim();
    if (isPhantomCaption(text)) {
      return NextResponse.json({ success: true, skipped: true });
    }

    await callRef.collection('captions').add({
      from: caller.uid,
      seq: Number.isFinite(seq) ? seq : 0,
      text,
      hebrewWords: extractHebrewWords(text),
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Live caption error:', error);
    return NextResponse.json({ error: 'caption failed' }, { status: 500 });
  }
}
