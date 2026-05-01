'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { usePartners } from '@/hooks/usePartners';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { UserProfile } from '@/types';
import { NavBar } from '@/components/NavBar';

const levelColors: Record<string, string> = {
  beginner: 'bg-orange-100 text-orange-700',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced: 'bg-green-100 text-green-700',
};

function getStatus(user: UserProfile): { label: string; color: string; dotColor: string; available: boolean } {
  if (user.inCall) {
    return { label: 'In a call', color: 'text-amber-500', dotColor: 'bg-amber-500', available: false };
  }
  if (user.isOnline) {
    return { label: 'Online', color: 'text-green-500', dotColor: 'bg-green-500', available: true };
  }
  return { label: 'Offline', color: 'text-gray-400', dotColor: 'bg-gray-400', available: false };
}

function PartnerCard({ user, onCall }: { user: UserProfile; onCall: () => void }) {
  const status = getStatus(user);

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4 transition ${
      status.available ? 'hover:shadow-sm' : 'opacity-75'
    }`}>
      <div className="relative">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold ${
          status.available ? 'bg-blue-400' : 'bg-gray-400'
        }`}>
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${status.dotColor}`} />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{user.displayName}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${levelColors[user.englishLevel]}`}>
            {user.englishLevel}
          </span>
          <span className="text-xs text-gray-400">{user.callCount} calls</span>
          <span className={`text-xs font-medium ${status.color}`}>
            {user.inCall && '🔴 '}{status.label}
          </span>
        </div>
      </div>

      {status.available ? (
        <button
          onClick={onCall}
          className="w-11 h-11 rounded-full bg-green-50 hover:bg-green-100 flex items-center justify-center transition text-xl"
        >
          📞
        </button>
      ) : (
        <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xl">
          📞
        </div>
      )}
    </div>
  );
}

export default function PartnersPage() {
  const { firebaseUser, loading: authLoading } = useAuthContext();
  const { partners, loading } = usePartners(firebaseUser?.uid);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !firebaseUser) router.replace('/login');
  }, [authLoading, firebaseUser, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{background: '#f8f9fa'}}>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Available Partners</h1>

        {partners.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">😴</p>
            <p className="text-lg font-semibold text-gray-900">No partners online right now</p>
            <p className="text-gray-500 mt-1">Check back later or update your availability</p>
          </div>
        ) : (
          <div className="space-y-3">
            {partners.map(p => (
              <PartnerCard
                key={p.id}
                user={p}
                onCall={() => router.push(`/call?partnerId=${p.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
