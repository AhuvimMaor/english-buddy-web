'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { NavBar } from '@/components/NavBar';
import { db, storage } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { firebaseUser, profile, signOut, loading } = useAuthContext();
  const router = useRouter();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace('/login');
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (profile && !isEditing) {
      setEditName(profile.displayName);
      setEditLevel(profile.englishLevel);
    }
  }, [profile, isEditing]);

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

  const handleSave = async () => {
    if (!firebaseUser) return;
    setIsSaving(true);
    
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        displayName: editName,
        englishLevel: editLevel,
        updatedAt: serverTimestamp(),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!firebaseUser || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    try {
      // Upload to Firebase Storage
      const storageRef = ref(storage, `users/${firebaseUser.uid}/profile_pic`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      // Update Firestore user document
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        photoURL: downloadURL,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error uploading image:', error);
    }
  };

  return (
    <div className="min-h-screen bg-warm-gradient bg-dots pb-20">
      <NavBar />

      <main className="px-5 pt-12">
        {/* Profile header */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div 
            className="relative w-20 h-20 mx-auto group cursor-pointer"
            onClick={() => isEditing && fileInputRef.current?.click()}
          >
            {profile.photoURL ? (
              <img 
                src={profile.photoURL} 
                alt={profile.displayName} 
                className={`w-20 h-20 rounded-full object-cover shadow-[var(--shadow-glow-coral)] ${isEditing ? 'opacity-80' : ''}`}
              />
            ) : (
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br from-[var(--accent-coral)] to-[var(--accent-amber)] flex items-center justify-center text-white text-3xl font-bold shadow-[var(--shadow-glow-coral)] ${isEditing ? 'opacity-80' : ''}`}>
                {profile.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            
            {isEditing && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xl">📷</span>
              </div>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload} 
            />
          </div>
          
          {isEditing ? (
            <div className="mt-4 max-w-xs mx-auto">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full text-center text-xl font-bold text-[var(--text-primary)] bg-transparent border-b-2 border-[var(--accent-coral)] focus:outline-none focus:border-[var(--accent-coral)] pb-1"
                placeholder="Your Name"
              />
            </div>
          ) : (
            <h1 className="text-xl font-bold text-[var(--text-primary)] mt-4">{profile.displayName}</h1>
          )}
          <p className="text-sm text-[var(--text-muted)] mt-1">{profile.email}</p>
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
        <div className="bg-white rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] mb-6 divide-y divide-gray-50 animate-fade-in-up stagger-3">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">📡</span>
              <span className="text-sm font-medium text-[var(--text-primary)]">Available for calls</span>
            </div>
            <button
              onClick={toggleOnline}
              disabled={isEditing}
              className={`w-12 h-7 rounded-full transition-all duration-300 relative ${
                profile.isOnline ? 'bg-[var(--accent-green)]' : 'bg-gray-200'
              } ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            
            {isEditing ? (
              <select
                value={editLevel}
                onChange={(e) => setEditLevel(e.target.value as any)}
                className="text-sm text-[var(--text-primary)] bg-gray-50 border border-gray-200 rounded p-1 focus:outline-none focus:border-[var(--accent-coral)]"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            ) : (
              <span className="text-sm text-[var(--text-muted)] capitalize">{profile.englishLevel}</span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 animate-fade-in-up stagger-4">
          {isEditing ? (
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 py-3.5 text-[var(--text-primary)] font-semibold text-sm bg-white rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] hover-lift"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-3.5 text-white font-semibold text-sm bg-gradient-to-r from-[var(--accent-coral)] to-[var(--accent-amber)] rounded-[var(--radius-sm)] shadow-[var(--shadow-glow-coral)] hover-lift disabled:opacity-70"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="w-full py-3.5 text-[var(--text-primary)] font-semibold text-sm bg-white rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] hover-lift"
            >
              Edit Profile
            </button>
          )}

          <button
            onClick={async () => { await signOut(); router.push('/login'); }}
            className="w-full mt-2 py-3.5 text-[var(--accent-coral)] font-semibold text-sm bg-[var(--accent-coral-light)] rounded-[var(--radius-sm)] hover-lift"
          >
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}
