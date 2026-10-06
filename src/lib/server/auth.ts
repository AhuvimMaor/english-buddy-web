import { timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from './admin';

export interface Caller {
  uid: string | null;
  // True when the request used INTERNAL_API_SECRET (ops scripts, reprocessing).
  internal: boolean;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

type HeaderReader = { headers: { get(name: string): string | null } };

export function bearerToken(req: HeaderReader): string | null {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Resolves who is calling a server route. Accepts either a Firebase ID token
// (browser/app users) or the INTERNAL_API_SECRET. Returns null when unauthenticated.
export async function authenticate(req: HeaderReader): Promise<Caller | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const secret = process.env.INTERNAL_API_SECRET;
  if (secret && safeEqual(token, secret)) return { uid: null, internal: true };

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    return { uid: decoded.uid, internal: false };
  } catch {
    return null;
  }
}

export function isParticipant(caller: Caller, call: { callerId?: string; calleeId?: string }): boolean {
  if (caller.internal) return true;
  return !!caller.uid && (caller.uid === call.callerId || caller.uid === call.calleeId);
}
