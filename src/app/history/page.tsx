'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { NavBar } from '@/components/NavBar';
import { db } from '@/lib/firebase';
import { collection, query, where, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Call } from '@/types';

function CallItem({ call, userId }: { call: Call; userId: string }) {
  const [partnerName, setPartnerName] = useState('');
  const router = useRouter();
  const isOutgoing = call.callerId === userId;
  const partnerId = isOutgoing ? call.calleeId : call.callerId;

  useEffect(() => {
    getDoc(doc(db, 'users', partnerId)).then(snap => {
      if (snap.exists()) setPartnerName(snap.data().displayName);
    }).catch(() => setPartnerName('Unknown'));
  }, [partnerId]);

  const duration = call.durationSeconds
    ? `${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}`
    : '0:00';

  return (
    <button
      onClick={() => {
        if (call.analysisStatus === 'complete') {
          router.push(`/history/${call.id}`);
        }
      }}
      className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-sm transition text-left"
    >
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
        {isOutgoing ? '📤' : '📥'}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900">{partnerName || '...'}</p>
        <p className="text-sm text-gray-500">
          {duration} {call.analysisStatus === 'complete' ? '📊' : '⏳'}
        </p>
      </div>
      {call.analysisStatus === 'complete' && (
        <span className="text-sm text-blue-500 font-medium">View Report</span>
      )}
    </button>
  );
}

export default function HistoryPage() {
  const { firebaseUser, loading: authLoading } = useAuthContext();
  const router = useRouter();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !firebaseUser) router.replace('/login');
  }, [authLoading, firebaseUser, router]);

  useEffect(() => {
    if (!firebaseUser) return;

    const q = query(
      collection(db, 'calls'),
      limit(50),
    );

    const unsub = onSnapshot(q, (snap) => {
      const userCalls = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Call))
        .filter(c =>
          c.status === 'ended' &&
          (c.callerId === firebaseUser.uid || c.calleeId === firebaseUser.uid)
        )
        .sort((a, b) => (b.endedAt?.seconds || 0) - (a.endedAt?.seconds || 0));
      setCalls(userCalls);
      setLoading(false);
    }, (err) => {
      console.error('[History] Query error:', err);
      setError(err.message);
      setLoading(false);
    });

    return unsub;
  }, [firebaseUser]);

  return (
    <div className="min-h-screen" style={{background: '#f8f9fa'}}>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Call History</h1>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">📞</p>
            <p className="text-lg font-semibold text-gray-900">No calls yet</p>
            <p className="text-gray-500 mt-1">Find a partner and start practicing!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map(c => (
              <CallItem key={c.id} call={c} userId={firebaseUser!.uid} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
