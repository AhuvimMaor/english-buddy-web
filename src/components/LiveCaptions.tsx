'use client';

import { useEffect, useRef } from 'react';
import { tokenizeCaption } from '@/lib/hebrew';
import type { Caption } from '@/hooks/useCaptions';

interface Props {
  captions: Caption[];
  myUid: string;
  partnerName: string;
}

// Rolling subtitles for the call screen. Hebrew words are highlighted so the
// learner can see which words they fell back to.
export function LiveCaptions({ captions, myUid, partnerName }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [captions.length]);

  if (captions.length === 0) {
    return <p className="text-center text-xs text-white/40">Captions will appear here as you talk</p>;
  }

  return (
    <div
      className="w-full max-w-md max-h-40 overflow-y-auto rounded-2xl bg-black/30 px-4 py-3 space-y-2"
      role="log"
      aria-live="polite"
      aria-label="Live captions"
    >
      {captions.map((c) => {
        const mine = c.from === myUid;
        return (
          <p key={c.id} className="text-sm leading-snug">
            <span className={`mr-2 text-[10px] font-bold uppercase tracking-wider ${mine ? 'text-blue-300' : 'text-white/50'}`}>
              {mine ? 'You' : partnerName || 'Buddy'}
            </span>
            {tokenizeCaption(c.text).map((t, i) =>
              t.hebrew ? (
                <span key={i} dir="rtl" className="rounded bg-amber-400/25 px-1 font-semibold text-amber-200">
                  {t.text}
                </span>
              ) : (
                <span key={i}>{t.text}</span>
              )
            )}
          </p>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
