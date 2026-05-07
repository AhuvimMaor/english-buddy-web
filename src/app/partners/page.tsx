'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { usePartners } from '@/hooks/usePartners';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { UserProfile } from '@/types';
import { NavBar } from '@/components/NavBar';

function getStatus(user: UserProfile) {
  if (user.inCall) return { label: 'In a call', dot: 'bg-amber-400', available: false };
  if (user.isOnline) return { label: 'Available', dot: 'bg-[var(--accent-green)]', available: true };
  return { label: 'Offline', dot: 'bg-gray-300', available: false };
}

const levelEmoji: Record<string, string> = {
  beginner: '🌱',
  intermediate: '📚',
  advanced: '🎯',
};

function PartnerCard({ user, onCall, index }: { user: UserProfile; onCall: () => void; index: number }) {
  const status = getStatus(user);

  return (
    <div
      className={`animate-fade-in-up stagger-${Math.min(index + 1, 5)} bg-white rounded-[var(--radius-md)] p-4 flex items-center gap-4 hover-lift border border-gray-50 ${
        !status.available ? 'opacity-60' : ''
      }`}
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="relative">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold ${
          status.available
            ? 'bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]'
            : 'bg-gray-300'
        }`}>
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${status.dot}`} />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[var(--text-primary)] truncate text-[15px]">{user.displayName}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-[var(--text-muted)]">
            {levelEmoji[user.englishLevel]} {user.englishLevel}
          </span>
          <span className="text-[var(--text-muted)]">·</span>
          <span className="text-xs text-[var(--text-muted)]">{user.callCount} calls</span>
        </div>
      </div>

      {status.available ? (
        <button
          onClick={onCall}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent-green)] to-emerald-500 flex items-center justify-center text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all active:scale-90"
        >
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
        </button>
      ) : (
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
        </div>
      )}
    </div>
  );
}

export default function PartnersPage() {
  const { firebaseUser, profile, loading: authLoading } = useAuthContext();
  const { partners, loading } = usePartners(firebaseUser?.uid);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !firebaseUser) router.replace('/login');
  }, [authLoading, firebaseUser, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--accent-coral)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-gradient bg-dots pb-20">
      <NavBar />

      {/* Header */}
      <header className="px-5 pt-12 pb-6">
        <div className="animate-fade-in-up">
          <p className="text-sm text-[var(--text-muted)] font-medium">Hey {profile?.displayName?.split(' ')[0] || 'there'} 👋</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">Find a practice partner</h1>
        </div>

        {/* Stats strip */}
        <div className="flex gap-3 mt-5 animate-fade-in-up stagger-2">
          <div className="flex-1 bg-white rounded-[var(--radius-sm)] p-3 shadow-[var(--shadow-sm)]">
            <p className="text-lg font-bold text-[var(--text-primary)]">{profile?.callCount || 0}</p>
            <p className="text-[11px] text-[var(--text-muted)] font-medium">Calls</p>
          </div>
          <div className="flex-1 bg-white rounded-[var(--radius-sm)] p-3 shadow-[var(--shadow-sm)]">
            <p className="text-lg font-bold text-[var(--text-primary)]">{Math.round(profile?.totalCallMinutes || 0)}</p>
            <p className="text-[11px] text-[var(--text-muted)] font-medium">Minutes</p>
          </div>
          <div className="flex-1 bg-white rounded-[var(--radius-sm)] p-3 shadow-[var(--shadow-sm)]">
            <p className="text-lg font-bold gradient-text">{partners.filter(p => getStatus(p).available).length}</p>
            <p className="text-[11px] text-[var(--text-muted)] font-medium">Online</p>
          </div>
        </div>
      </header>

      {/* Partners list */}
      <main className="px-5">
        {partners.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="text-5xl mb-4 animate-float">😴</div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">No partners online</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">Check back in a few minutes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {partners.map((p, i) => (
              <PartnerCard
                key={p.id}
                user={p}
                index={i}
                onCall={() => router.push(`/call?partnerId=${p.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
