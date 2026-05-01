import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminDb() {
  if (getApps().length === 0) {
    if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true') {
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
      initializeApp({ projectId: 'demo-english-buddy' });
    } else {
      initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '' });
    }
  }
  return getFirestore();
}

export async function GET() {
  try {
    const db = getAdminDb();

    const usersSnap = await db.collection('users').get();
    const users = usersSnap.docs.map(d => ({
      id: d.id,
      displayName: d.data().displayName,
      email: d.data().email,
      isOnline: d.data().isOnline,
      inCall: d.data().inCall,
      callCount: d.data().callCount,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    const callsSnap = await db.collection('calls').orderBy('createdAt', 'desc').limit(10).get();
    const calls = callsSnap.docs.map(d => ({
      id: d.id,
      callerId: d.data().callerId,
      calleeId: d.data().calleeId,
      status: d.data().status,
      analysisStatus: d.data().analysisStatus,
      durationSeconds: d.data().durationSeconds,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    const reportsSnap = await db.collection('reports').limit(10).get();
    const reports = reportsSnap.docs.map(d => ({
      id: d.id,
      callId: d.data().callId,
      userId: d.data().userId,
      fluencyScore: d.data().fluencyScore,
    }));

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      users,
      calls,
      reports,
      env: {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'NOT SET',
        useEmulators: process.env.NEXT_PUBLIC_USE_EMULATORS || 'NOT SET',
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      },
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
