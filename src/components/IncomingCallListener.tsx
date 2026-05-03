'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthContext } from './AuthProvider';
import { useRouter, usePathname } from 'next/navigation';

export function IncomingCallListener() {
  const { firebaseUser } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callerId: string;
    callerName: string;
  } | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Don't listen while on call page
  const onCallPage = pathname?.startsWith('/call');

  useEffect(() => {
    if (!firebaseUser || onCallPage) return;

    console.log('[Incoming] Listening for calls to:', firebaseUser.uid);

    const unsub = onSnapshot(collection(db, 'calls'), (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type !== 'added' && change.type !== 'modified') return;
        const data = change.doc.data();

        if (
          data.calleeId === firebaseUser.uid &&
          data.status === 'ringing'
        ) {
          console.log('[Incoming] Incoming call:', change.doc.id);
          try {
            const callerDoc = await getDoc(doc(db, 'users', data.callerId));
            setIncomingCall({
              callId: change.doc.id,
              callerId: data.callerId,
              callerName: callerDoc.data()?.displayName || 'Someone',
            });
          } catch (err) {
            console.error('[Incoming] Error getting caller:', err);
            setIncomingCall({
              callId: change.doc.id,
              callerId: data.callerId,
              callerName: 'Someone',
            });
          }
        }
      });
    }, (err) => {
      console.error('[Incoming] Listener error:', err);
    });

    return unsub;
  }, [firebaseUser, onCallPage]);

  // Vibrate + ring when incoming call
  useEffect(() => {
    if (incomingCall) {
      ringIntervalRef.current = setInterval(() => {
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      }, 2000);

      // Auto-dismiss after 30s
      const timeout = setTimeout(() => {
        setIncomingCall(null);
      }, 30000);

      return () => {
        clearInterval(ringIntervalRef.current);
        clearTimeout(timeout);
        if (navigator.vibrate) navigator.vibrate(0);
      };
    }
  }, [incomingCall]);

  if (!incomingCall) return null;

  const accept = async () => {
    clearInterval(ringIntervalRef.current);
    if (navigator.vibrate) navigator.vibrate(0);

    await updateDoc(doc(db, 'calls', incomingCall.callId), {
      status: 'active',
      startedAt: serverTimestamp(),
    });
    const { callId, callerId } = incomingCall;
    setIncomingCall(null);
    router.push(`/call?callId=${callId}&partnerId=${callerId}&role=callee`);
  };

  const decline = async () => {
    clearInterval(ringIntervalRef.current);
    if (navigator.vibrate) navigator.vibrate(0);

    await updateDoc(doc(db, 'calls', incomingCall.callId), {
      status: 'declined',
    });
    setIncomingCall(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <div className="w-20 h-20 rounded-full bg-blue-400 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 animate-pulse">
          {incomingCall.callerName.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-xl font-bold text-gray-900">{incomingCall.callerName}</h2>
        <p className="text-gray-500 mt-1">wants to practice English with you</p>
        <p className="text-gray-400 text-xs mt-2 animate-pulse">📞 Incoming call...</p>

        <div className="flex gap-4 mt-8">
          <button
            onClick={decline}
            className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition active:scale-95"
          >
            ✕ Decline
          </button>
          <button
            onClick={accept}
            className="flex-1 py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition active:scale-95"
          >
            📞 Accept
          </button>
        </div>
      </div>
    </div>
  );
}
