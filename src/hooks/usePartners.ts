'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where, or } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile } from '@/types';

export function usePartners(currentUserId: string | undefined) {
  const [partners, setPartners] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) return;

    const q = query(
      collection(db, 'users'),
      orderBy('updatedAt', 'desc'),
      limit(50),
    );

    const unsub = onSnapshot(q, (snap) => {
      const users = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as UserProfile))
        .filter(u => u.id !== currentUserId);
      setPartners(users);
      setLoading(false);
    });

    return unsub;
  }, [currentUserId]);

  return { partners, loading };
}
