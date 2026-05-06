'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { NavBar } from '@/components/NavBar';
import { db } from '@/lib/firebase';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Report, TranscriptLine } from '@/types';

function TranscriptView({ transcript }: { transcript: TranscriptLine[] }) {
  if (!transcript || transcript.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-lg font-bold text-gray-900 mb-3">📝 Conversation</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {transcript.map((line, i) => (
          <div key={i} className={`${line.speaker === 'user' ? 'pl-0' : 'pl-4'}`}>
            <div className="flex items-start gap-2">
              <span className={`text-xs font-bold mt-1 flex-shrink-0 ${
                line.speaker === 'user' ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {line.speaker === 'user' ? 'You' : 'Partner'}
              </span>
              <div className="flex-1">
                <p className={`text-sm ${
                  line.correction ? 'text-red-500 line-through' : 'text-gray-700'
                }`}>
                  {line.text}
                </p>
                {line.correction && (
                  <div className="mt-1">
                    <p className="text-sm text-green-600 font-medium">✓ {line.correction}</p>
                    {line.correctionExplanation && (
                      <p className="text-xs text-gray-400 mt-0.5">{line.correctionExplanation}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
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
      if (!snap.empty) {
        setReport({ id: snap.docs[0].id, ...snap.docs[0].data() } as Report);
      }
      setLoading(false);
    });
    return unsub;
  }, [callId, firebaseUser]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{background: '#f8f9fa'}}>
        <NavBar />
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen" style={{background: '#f8f9fa'}}>
        <NavBar />
        <div className="text-center py-16">
          <p className="text-5xl mb-4">⏳</p>
          <p className="text-lg font-semibold text-gray-900">Report not ready yet</p>
          <p className="text-gray-500 mt-1">We&apos;re still analyzing your conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{background: '#f8f9fa'}}>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center mx-auto mb-3">
            <span className="text-4xl font-bold text-white">{report.fluencyScore || '-'}</span>
          </div>
          <p className="text-sm text-gray-400">/ 10</p>
          <p className="text-sm text-gray-500 mt-1">{Math.floor(report.callDuration / 60)} min call</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <p className="text-gray-700 leading-relaxed">{report.summary}</p>
        </div>

        <TranscriptView transcript={report.transcript} />

        {report.grammarMistakes?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">
              ❌ Grammar Mistakes ({report.grammarMistakes.length})
            </h2>
            <div className="space-y-3">
              {report.grammarMistakes.map((m, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-red-500 italic">&ldquo;{m.original}&rdquo;</p>
                  <p className="text-center text-gray-400 my-1">↓</p>
                  <p className="text-green-600 font-semibold">&ldquo;{m.corrected}&rdquo;</p>
                  <p className="text-sm text-gray-500 mt-2">{m.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.hebrewWords?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">
              🇮🇱 Hebrew Words ({report.hebrewWords.length})
            </h2>
            <div className="space-y-3">
              {report.hebrewWords.map((w, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold">{w.hebrew}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-lg font-bold text-blue-500">{w.english}</span>
                  </div>
                  <p className="text-sm text-gray-500 italic mt-1">&ldquo;{w.context}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.tips?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">💡 Tips</h2>
            <div className="space-y-2">
              {report.tips.map((tip, i) => (
                <div key={i} className="flex gap-3 bg-white rounded-xl border border-gray-200 p-4">
                  <span>💡</span>
                  <p className="text-gray-700">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
