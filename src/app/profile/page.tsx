'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { NavBar } from '@/components/NavBar';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { firebaseUser, profile, signOut, loading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace('/login');
  }, [loading, firebaseUser, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-warm-gradient flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--accent-coral)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const toggleOnline = async () => {
    if (!firebaseUser) return;
    await updateDoc(doc(db, 'users', firebaseUser.uid), {
      isOnline: !profile.isOnline,
      updatedAt: serverTimestamp(),
    });
  };

  return (
    <div className="min-h-screen bg-warm-gradient bg-dots pb-20">
      <NavBar />

      <main className="px-5 pt-12">
        {/* Profile header */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--accent-coral)] to-[var(--accent-amber)] flex items-center justify-center text-white text-3xl font-bold mx-auto shadow-[var(--shadow-glow-coral)]">
            {profile.displayName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mt-4">{profile.displayName}</h1>
          <p className="text-sm text-[var(--text-muted)]">{profile.email}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6 animate-fade-in-up stagger-2">
          <div className="bg-white rounded-[var(--radius-md)] p-4 text-center shadow-[var(--shadow-sm)]">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{profile.callCount}</p>
            <p className="text-[11px] text-[var(--text-muted)] font-medium mt-1">Calls</p>
          </div>
          <div className="bg-white rounded-[var(--radius-md)] p-4 text-center shadow-[var(--shadow-sm)]">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{Math.round(profile.totalCallMinutes)}</p>
            <p className="text-[11px] text-[var(--text-muted)] font-medium mt-1">Minutes</p>
          </div>
          <div className="bg-white rounded-[var(--radius-md)] p-4 text-center shadow-[var(--shadow-sm)]">
            <p className="text-2xl font-bold gradient-text capitalize">{profile.englishLevel}</p>
            <p className="text-[11px] text-[var(--text-muted)] font-medium mt-1">Level</p>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] divide-y divide-gray-50 animate-fade-in-up stagger-3">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">📡</span>
              <span className="text-sm font-medium text-[var(--text-primary)]">Available for calls</span>
            </div>
            <button
              onClick={toggleOnline}
              className={`w-12 h-7 rounded-full transition-all duration-300 relative ${
                profile.isOnline ? 'bg-[var(--accent-green)]' : 'bg-gray-200'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-1 transition-all duration-300 ${
                  profile.isOnline ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">🌍</span>
              <span className="text-sm font-medium text-[var(--text-primary)]">Native language</span>
            </div>
            <span className="text-sm text-[var(--text-muted)]">Hebrew</span>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">📈</span>
              <span className="text-sm font-medium text-[var(--text-primary)]">English level</span>
            </div>
            <span className="text-sm text-[var(--text-muted)] capitalize">{profile.englishLevel}</span>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={async () => { await signOut(); router.push('/login'); }}
          className="w-full mt-6 py-3.5 text-[var(--accent-coral)] font-semibold text-sm bg-[var(--accent-coral-light)] rounded-[var(--radius-sm)] hover-lift animate-fade-in-up stagger-4"
        >
          Sign Out
        </button>
      </main>
    </div>
  );
}
