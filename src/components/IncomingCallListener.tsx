'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthContext } from './AuthProvider';
import { useRouter } from 'next/navigation';

export function IncomingCallListener() {
  const { firebaseUser } = useAuthContext();
  const router = useRouter();
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callerId: string;
    callerName: string;
  } | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;

    const q = query(
      collection(db, 'calls'),
      where('calleeId', '==', firebaseUser.uid),
      where('status', '==', 'ringing'),
    );

    const unsub = onSnapshot(q, async (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type === 'added') {
          const data = change.doc.data();
          const callerDoc = await (await import('firebase/firestore')).getDoc(
            doc(db, 'users', data.callerId),
          );
          setIncomingCall({
            callId: change.doc.id,
            callerId: data.callerId,
            callerName: callerDoc.data()?.displayName || 'Someone',
          });
        }
      }
    });

    return unsub;
  }, [firebaseUser]);

  if (!incomingCall) return null;

  const accept = async () => {
    await updateDoc(doc(db, 'calls', incomingCall.callId), {
      status: 'active',
      startedAt: serverTimestamp(),
    });
    const { callId, callerId } = incomingCall;
    setIncomingCall(null);
    router.push(`/call?callId=${callId}&partnerId=${callerId}&role=callee`);
  };

  const decline = async () => {
    await updateDoc(doc(db, 'calls', incomingCall.callId), {
      status: 'declined',
    });
    setIncomingCall(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <div className="w-20 h-20 rounded-full bg-blue-400 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
          {incomingCall.callerName.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-xl font-bold text-gray-900">{incomingCall.callerName}</h2>
        <p className="text-gray-500 mt-1">wants to practice English with you</p>

        <div className="flex gap-4 mt-8">
          <button
            onClick={decline}
            className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="flex-1 py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
