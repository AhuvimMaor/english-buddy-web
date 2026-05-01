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
      <div className="min-h-screen" style={{background: '#f8f9fa'}}>
        <NavBar />
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
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

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen" style={{background: '#f8f9fa'}}>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-blue-400 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-3">
            {profile.displayName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{profile.displayName}</h1>
          <p className="text-gray-500 text-sm">{profile.email}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-6">
          <div className="flex items-center justify-between p-4">
            <span className="text-gray-700">Available for calls</span>
            <button
              onClick={toggleOnline}
              className={`w-12 h-7 rounded-full transition relative ${
                profile.isOnline ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white absolute top-1 transition ${
                  profile.isOnline ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-gray-700">English Level</span>
            <span className="text-gray-500 capitalize">{profile.englishLevel}</span>
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-gray-700">Total Calls</span>
            <span className="text-gray-500">{profile.callCount}</span>
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-gray-700">Practice Time</span>
            <span className="text-gray-500">{Math.round(profile.totalCallMinutes)} min</span>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full py-3 text-red-500 font-semibold hover:bg-red-50 rounded-xl transition"
        >
          Sign Out
        </button>
      </main>
    </div>
  );
}
