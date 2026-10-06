'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, limitToLast, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface Caption {
  id: string;
  from: string;
  text: string;
  hebrewWords: string[];
}

// Live captions for a call, newest last. Both participants' lines arrive here
// (written by /api/live-caption), ordered by server time.
export function useCaptions(callId: string, enabled = true, max = 30): Caption[] {
  const [captions, setCaptions] = useState<Caption[]>([]);

  useEffect(() => {
    if (!callId || !enabled) return;
    const q = query(collection(db, 'calls', callId, 'captions'), orderBy('createdAt'), limitToLast(max));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCaptions(
          snap.docs.map((d) => {
            const data = d.data();
            return { id: d.id, from: data.from, text: data.text, hebrewWords: data.hebrewWords || [] };
          })
        );
      },
      (err) => console.warn('[Captions] listener error:', err.message)
    );
    return unsub;
  }, [callId, enabled, max]);

  return captions;
}
