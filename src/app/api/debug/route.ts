import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

export async function GET() {
  try {
    const db = getAdminDb();

    const usersSnap = await db.collection('users').get();
    const users = usersSnap.docs.map(d => ({
      id: d.id,
      displayName: d.data().displayName,
    }));

    const callsSnap = await db.collection('calls').orderBy('createdAt', 'desc').limit(5).get();
    const calls = callsSnap.docs.map(d => Object.assign({id: d.id}, d.data()));

    const reportsSnap = await db.collection('reports').orderBy('createdAt', 'desc').limit(5).get();
    const reports = reportsSnap.docs.map(d => Object.assign({id: d.id}, d.data()));

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      users,
      calls,
      reports,
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
