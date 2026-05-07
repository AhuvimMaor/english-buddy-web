'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { NavBar } from '@/components/NavBar';
import { db } from '@/lib/firebase';
import { collection, query, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Call } from '@/types';

function CallItem({ call, userId, index }: { call: Call; userId: string; index: number }) {
  const [partnerName, setPartnerName] = useState('');
  const router = useRouter();
  const isOutgoing = call.callerId === userId;
  const partnerId = isOutgoing ? call.calleeId : call.callerId;

  useEffect(() => {
    getDoc(doc(db, 'users', partnerId)).then(snap => {
      if (snap.exists()) setPartnerName(snap.data().displayName);
    }).catch(() => setPartnerName('Partner'));
  }, [partnerId]);

  const duration = call.durationSeconds
    ? `${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}`
    : '0:00';

  const hasReport = call.analysisStatus === 'complete';

  return (
    <button
      onClick={() => hasReport && router.push(`/history/${call.id}`)}
      className={`animate-fade-in-up stagger-${Math.min(index + 1, 5)} w-full bg-white rounded-[var(--radius-md)] p-4 flex items-center gap-4 text-left shadow-[var(--shadow-sm)] border border-gray-50 ${
        hasReport ? 'hover-lift cursor-pointer' : 'opacity-70'
      }`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
        hasReport
          ? 'bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]'
          : 'bg-gray-300'
      }`}>
        {partnerName ? partnerName.charAt(0).toUpperCase() : '?'}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-[var(--text-primary)] text-[15px]">{partnerName || '...'}</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          {duration} · {hasReport ? '✅ Report ready' : '⏳ Processing...'}
        </p>
      </div>
      {hasReport && (
        <div className="text-[var(--accent-blue)]">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
          </svg>
        </div>
      )}
    </button>
  );
}

export default function HistoryPage() {
  const { firebaseUser, loading: authLoading } = useAuthContext();
  const router = useRouter();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !firebaseUser) router.replace('/login');
  }, [authLoading, firebaseUser, router]);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(collection(db, 'calls'), limit(50));
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
    }, () => setLoading(false));
    return unsub;
  }, [firebaseUser]);

  return (
    <div className="min-h-screen bg-warm-gradient bg-dots pb-20">
      <NavBar />
      <main className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-6 animate-fade-in-up">Your Reports</h1>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-[var(--accent-coral)] border-t-transparent rounded-full" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="text-5xl mb-4 animate-float">📊</div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">No reports yet</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">Complete a call to get your first analysis</p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map((c, i) => (
              <CallItem key={c.id} call={c} userId={firebaseUser!.uid} index={i} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
