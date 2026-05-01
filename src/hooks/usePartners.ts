'use client';

import { useState, useEffect } from 'react';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile } from '@/types';

export function usePartners(currentUserId: string | undefined) {
  const [partners, setPartners] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUserId) {
      console.log('[Partners] No currentUserId, skipping query');
      return;
    }

    console.log('[Partners] Querying users collection, currentUser:', currentUserId);

    const q = query(
      collection(db, 'users'),
      limit(50),
    );

    const unsub = onSnapshot(q, (snap) => {
      console.log('[Partners] Snapshot received, docs:', snap.size);
      const users = snap.docs
        .map(d => {
          const data = d.data();
          console.log('[Partners] User doc:', d.id, data.displayName, 'online:', data.isOnline, 'inCall:', data.inCall);
          return {
            id: d.id,
            ...data,
            inCall: data.inCall ?? false,
          } as UserProfile;
        })
        .filter(u => u.id !== currentUserId);
      console.log('[Partners] Filtered partners:', users.length);
      setPartners(users);
      setLoading(false);
    }, (err) => {
      console.error('[Partners] Query error:', err);
      setError(err.message);
      setLoading(false);
    });

    return unsub;
  }, [currentUserId]);

  return { partners, loading, error };
}
