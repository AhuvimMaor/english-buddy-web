import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function getAdminApp() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
      const decoded = serviceAccount.startsWith('{')
        ? serviceAccount
        : Buffer.from(serviceAccount, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      return initializeApp({ credential: cert(parsed), storageBucket: "english-buddy-431f9.firebasestorage.app" });
    } else if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true') {
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
      return initializeApp({ projectId: 'demo-english-buddy', storageBucket: "demo-english-buddy.firebasestorage.app" });
    } else {
      return initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '', storageBucket: "english-buddy-431f9.firebasestorage.app" });
    }
  }
  return getApps()[0];
}

export async function GET(req: NextRequest) {
  try {
    const app = getAdminApp();
    const db = getFirestore(app);
    const prefix = req.nextUrl.searchParams.get('prefix');

    if (prefix) {
      const bucket = getStorage(app).bucket();
      const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
      
      const sortedFiles = files
        .map(f => {
          const match = f.name.match(/chunk-(\d+)\.[a-z0-9]+$/i);
          return { file: f, index: match ? parseInt(match[1], 10) : -1 };
        })
        .filter(f => f.index !== -1)
        .sort((a, b) => a.index - b.index);

      if (sortedFiles.length === 0) {
        return NextResponse.json({ error: `No chunks found for ${prefix}` }, { status: 404 });
      }

      const chunks = [];
      for (const { file } of sortedFiles) {
        const [buffer] = await file.download();
        chunks.push(buffer);
      }

      const fullBuffer = Buffer.concat(chunks);
      return new NextResponse(fullBuffer, {
        headers: {
          'Content-Type': 'audio/webm',
          'Content-Disposition': `attachment; filename="${prefix.split('/').join('_')}.webm"`,
        },
      });
    }

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
