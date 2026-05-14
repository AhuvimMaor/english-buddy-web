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
    let resetDone = false;

    // Set online + lastSeen timestamp
    updateDoc(userRef, { isOnline: true, inCall: false, lastSeen: serverTimestamp() }).catch(() => {});

    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile({ id: snap.id, ...data } as UserProfile);

        if (!resetDone && data.inCall) {
          resetDone = true;
          updateDoc(userRef, { inCall: false, isOnline: true }).catch(() => {});
        }
      }
      setLoading(false);
    });

    // Heartbeat - update lastSeen every 30s while active
    const heartbeat = setInterval(() => {
      if (!document.hidden) {
        updateDoc(userRef, { lastSeen: serverTimestamp() }).catch(() => {});
      }
    }, 30000);

    // Set offline when user leaves or hides app
    const goOffline = () => {
      updateDoc(userRef, { isOnline: false }).catch(() => {});
    };
    const goOnline = () => {
      updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});
    };
    const handleVisibility = () => {
      if (document.hidden) {
        goOffline();
      } else {
        goOnline();
      }
    };

    window.addEventListener('beforeunload', goOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', goOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      goOffline();
      unsub();
    };
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
