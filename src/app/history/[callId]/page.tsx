'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { NavBar } from '@/components/NavBar';
import { db } from '@/lib/firebase';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Report, TranscriptLine } from '@/types';

function ScoreRing({ score }: { score: number | null }) {
  const s = score || 0;
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (s / 10) * circumference;
  const color = s >= 7 ? 'var(--accent-green)' : s >= 5 ? 'var(--accent-amber)' : 'var(--accent-coral)';

  return (
    <div className="relative w-28 h-28 mx-auto animate-scale-in">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" stroke="#f3f4f6" strokeWidth="8" fill="none" />
        <circle
          cx="50" cy="50" r="42"
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-[var(--text-primary)]">{s}</span>
        <span className="text-[10px] text-[var(--text-muted)] font-medium">/10</span>
      </div>
    </div>
  );
}

function HighlightedText({ text, corrections }: { text: string; corrections: any[] | null }) {
  if (!corrections || corrections.length === 0) {
    return <span>{text}</span>;
  }

  let result: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  for (const corr of corrections) {
    const wrong = corr.wrong || corr.original || '';
    const right = corr.right || corr.corrected || '';
    const explanation = corr.explanation || '';

    const idx = remaining.toLowerCase().indexOf(wrong.toLowerCase());
    if (idx === -1) {
      continue;
    }

    if (idx > 0) {
      result.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
    }

    result.push(
      <span key={key++} className="inline-block">
        <span className="text-[var(--accent-coral)] line-through decoration-1">{remaining.slice(idx, idx + wrong.length)}</span>
        <span className="text-[var(--accent-green)] font-semibold ml-1">{right}</span>
        {explanation && (
          <span className="block text-[10px] text-[var(--text-muted)] mt-0.5 ml-0.5">{explanation}</span>
        )}
      </span>
    );

    remaining = remaining.slice(idx + wrong.length);
  }

  if (remaining) {
    result.push(<span key={key++}>{remaining}</span>);
  }

  return <>{result}</>;
}

function TranscriptView({ transcript }: { transcript: TranscriptLine[] }) {
  if (!transcript || transcript.length === 0) return null;

  return (
    <div className="mb-6 animate-fade-in-up stagger-3">
      <h2 className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-[var(--accent-blue-light)] flex items-center justify-center text-sm">📝</span>
        Conversation
      </h2>
      <div className="bg-white rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-4 space-y-4">
        {transcript.map((line, i) => {
          const hasCorrections = line.corrections && line.corrections.length > 0;
          return (
            <div key={i} className={line.speaker === 'partner' ? 'opacity-50' : ''}>
              <div className="flex items-start gap-2">
                <span className={`text-[10px] font-bold mt-1 flex-shrink-0 uppercase tracking-wider ${
                  line.speaker === 'user' ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]'
                }`}>
                  {line.speaker === 'user' ? 'You' : 'Them'}
                </span>
                <p className="flex-1 text-sm leading-relaxed text-[var(--text-primary)]">
                  <HighlightedText text={line.text} corrections={line.corrections} />
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportPage() {
  const { firebaseUser } = useAuthContext();
  const params = useParams();
  const callId = params.callId as string;
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser || !callId) return;
    const q = query(
      collection(db, 'reports'),
      where('callId', '==', callId),
      where('userId', '==', firebaseUser.uid),
      limit(1),
    );
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) setReport({ id: snap.docs[0].id, ...snap.docs[0].data() } as Report);
      setLoading(false);
    });
    return unsub;
  }, [callId, firebaseUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-gradient flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--accent-coral)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-warm-gradient bg-dots pb-20">
        <NavBar />
        <div className="text-center py-20 animate-fade-in">
          <div className="text-5xl mb-4 animate-float">⏳</div>
          <p className="text-lg font-semibold text-[var(--text-primary)]">Report not ready</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Still analyzing your conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-gradient bg-dots pb-20">
      <NavBar />
      <main className="px-5 pt-10 max-w-lg mx-auto">
        {/* Score */}
        <div className="text-center mb-6 animate-fade-in-up">
          <ScoreRing score={report.fluencyScore} />
          <p className="text-sm text-[var(--text-muted)] mt-3">
            {Math.floor(report.callDuration / 60)} min conversation
          </p>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-4 mb-6 animate-fade-in-up stagger-2">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{report.summary}</p>
        </div>

        {/* Transcript */}
        <TranscriptView transcript={report.transcript} />

        {/* Grammar */}
        {report.grammarMistakes?.length > 0 && (
          <div className="mb-6 animate-fade-in-up stagger-4">
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[var(--accent-coral-light)] flex items-center justify-center text-sm">❌</span>
              Mistakes ({report.grammarMistakes.length})
            </h2>
            <div className="space-y-2">
              {report.grammarMistakes.map((m, i) => (
                <div key={i} className="bg-white rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] p-4">
                  <p className="text-sm text-[var(--accent-coral)] line-through decoration-1">{m.original}</p>
                  <p className="text-sm text-[var(--accent-green)] font-medium mt-1">✓ {m.corrected}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-2">{m.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hebrew words */}
        {report.hebrewWords?.length > 0 && (
          <div className="mb-6 animate-fade-in-up stagger-5">
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[var(--accent-purple-light)] flex items-center justify-center text-sm">🇮🇱</span>
              Words to Learn ({report.hebrewWords.length})
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {report.hebrewWords.map((w, i) => (
                <div key={i} className="bg-white rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] p-4 flex items-center gap-3">
                  <span className="text-lg font-bold text-[var(--text-primary)]">{w.hebrew}</span>
                  <span className="text-[var(--text-muted)]">→</span>
                  <span className="text-sm font-semibold text-[var(--accent-blue)]">{w.english}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tips */}
        {report.tips?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[var(--accent-amber-light)] flex items-center justify-center text-sm">💡</span>
              Tips
            </h2>
            <div className="space-y-2">
              {report.tips.map((tip, i) => (
                <div key={i} className="bg-white rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] p-4">
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
