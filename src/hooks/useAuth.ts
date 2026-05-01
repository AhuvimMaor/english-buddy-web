'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import { getDoc } from 'firebase/firestore';
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { UserProfile } from '@/types';

const EMPTY_AVAILABILITY = {
  sunday: [], monday: [], tuesday: [], wednesday: [],
  thursday: [], friday: [], saturday: [],
};

export function useAuth() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    const userRef = doc(db, 'users', firebaseUser.uid);

    // Reset stuck inCall status on load
    updateDoc(userRef, {
      inCall: false,
      isOnline: true,
      updatedAt: serverTimestamp(),
    }).catch(() => {});

    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setProfile({ id: snap.id, ...snap.data() } as UserProfile);
      }
      setLoading(false);
    });
    return unsub;
  }, [firebaseUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });

    await setDoc(doc(db, 'users', cred.user.uid), {
      displayName,
      email,
      photoURL: null,
      englishLevel: 'beginner',
      nativeLanguage: 'hebrew',
      availability: EMPTY_AVAILABILITY,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isOnline: true,
      fcmToken: null,
      totalCallMinutes: 0,
      callCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, []);

  const createUserProfile = useCallback(async (user: FirebaseUser) => {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      await setDoc(userDocRef, {
        displayName: user.displayName || 'User',
        email: user.email || '',
        photoURL: user.photoURL || null,
        englishLevel: 'beginner',
        nativeLanguage: 'hebrew',
        availability: EMPTY_AVAILABILITY,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isOnline: true,
        inCall: false,
        fcmToken: null,
        totalCallMinutes: 0,
        callCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userDocRef, {
        isOnline: true,
        updatedAt: serverTimestamp(),
      });
    }
  }, []);

  // Handle redirect result on page load
  useEffect(() => {
    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        await createUserProfile(result.user);
      }
    }).catch(() => {});
  }, [createUserProfile]);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      const cred = await signInWithPopup(auth, provider);
      await createUserProfile(cred.user);
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        await signInWithRedirect(auth, provider);
      } else {
        throw err;
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    if (firebaseUser) {
      await updateDoc(doc(db, 'users', firebaseUser.uid), { isOnline: false });
    }
    await firebaseSignOut(auth);
  }, [firebaseUser]);

  return { firebaseUser, profile, loading, signIn, signUp, signInWithGoogle, signOut };
}
