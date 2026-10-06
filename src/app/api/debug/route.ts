import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminBucket } from '@/lib/server/admin';
import { authenticate } from '@/lib/server/auth';
import { sortChunkFilesByIndex } from '@/lib/recording';

// Ops-only inspection endpoint. It exposes user data and raw recordings, so it
// is closed unless INTERNAL_API_SECRET is configured AND sent as a Bearer token.
export async function GET(req: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const caller = await authenticate(req);
  if (!caller?.internal) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const prefix = req.nextUrl.searchParams.get('prefix');

    if (prefix) {
      if (!/^recordings\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(prefix)) {
        return NextResponse.json({ error: 'invalid prefix' }, { status: 400 });
      }
      const bucket = getAdminBucket();
      const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
      const ordered = sortChunkFilesByIndex(files.map((f) => f.name));
      if (ordered.length === 0) {
        return NextResponse.json({ error: `No chunks found for ${prefix}` }, { status: 404 });
      }
      const buffers = await Promise.all(ordered.map((name) => bucket.file(name).download().then(([b]) => b)));
      return new NextResponse(new Uint8Array(Buffer.concat(buffers)), {
        headers: {
          'Content-Type': 'audio/webm',
          'Content-Disposition': `attachment; filename="${prefix.split('/').join('_')}.webm"`,
        },
      });
    }

    const db = getAdminDb();
    const [callsSnap, reportsSnap] = await Promise.all([
      db.collection('calls').orderBy('createdAt', 'desc').limit(5).get(),
      db.collection('reports').orderBy('createdAt', 'desc').limit(5).get(),
    ]);
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      calls: callsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      reports: reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (error) {
    console.error('Debug route error:', error);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
