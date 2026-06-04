'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef, Suspense } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AnalysisStatus } from '@/types';

const STEPS = [
  { key: 'pending', label: 'Uploading recording', icon: '📤' },
  { key: 'transcribing', label: 'Transcribing conversation', icon: '🎙️' },
  { key: 'analyzing', label: 'Analyzing your English', icon: '🧠' },
  { key: 'complete', label: 'Report ready!', icon: '📊' },
] as const;

function getStepIndex(status: AnalysisStatus): number {
  const idx = STEPS.findIndex(s => s.key === status);
  return idx >= 0 ? idx : 0;
}

function ProcessingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callId = searchParams.get('callId') || '';
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('pending');
  const [failed, setFailed] = useState(false);
  const [failMessage, setFailMessage] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const triggeredRef = useRef(false);

  // Trigger analysis API. The request can run for several minutes on a long
  // call, so the Firestore listener below is the source of truth for
  // progress/completion — we only surface *definitive* errors from here.
  useEffect(() => {
    if (!callId || triggeredRef.current) return;
    triggeredRef.current = true;

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    })
      .then(async (res) => {
        if (res.ok) return;
        // Gateway timeouts (502/503/504) happen when the edge proxy gives up
        // while the server keeps processing — not fatal, let the listener win.
        if (res.status >= 502 && res.status <= 504) return;
        const data = await res.json().catch(() => ({}));
        setFailed(true);
        setFailMessage(data.error || `Server error: ${res.status}`);
      })
      .catch((err) => {
        // Network error / proxy timeout: the request may still be processing
        // server-side. Don't fail here — the listener reports progress, and the
        // stall guard covers a request that truly never started.
        console.warn('[Processing] analyze request did not return cleanly:', err?.message || err);
      });
  }, [callId]);

  // Listen for status updates
  useEffect(() => {
    if (!callId) return;

    const unsub = onSnapshot(doc(db, 'calls', callId), (snap) => {
      const data = snap.data();
      if (!data) return;

      const status = data.analysisStatus as AnalysisStatus;
      setAnalysisStatus(status);

      if (status === 'failed') {
        setFailed(true);
        setFailMessage('Analysis failed on server');
      }

      if (status === 'complete') {
        setTimeout(() => {
          router.push(`/history/${callId}`);
        }, 2000);
      }
    });

    return unsub;
  }, [callId, router]);

  // Stall guard: this effect re-runs on every status change, so the timer
  // resets each time analysis advances. A long (e.g. 1-hour) call can take
  // several minutes per phase, so only show a calm "check later" note if a
  // single phase makes no progress for a while. Not a hard failure.
  useEffect(() => {
    if (failed || timedOut || analysisStatus === 'complete') return;
    const timeout = setTimeout(() => {
      setTimedOut(true);
    }, 8 * 60 * 1000); // 8 minutes with no progress
    return () => clearTimeout(timeout);
  }, [analysisStatus, failed, timedOut]);

  const currentStep = getStepIndex(analysisStatus);
  const progress = failed ? 100 : ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{background: '#f8f9fa'}}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">
            {failed ? '❌' : analysisStatus === 'complete' ? '✅' : timedOut ? '🕐' : '⏳'}
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {failed
              ? 'Analysis Failed'
              : analysisStatus === 'complete'
                ? 'Report Ready!'
                : timedOut
                  ? 'Still Working On It'
                  : 'Processing Your Call'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {failed
              ? failMessage
              : analysisStatus === 'complete'
                ? 'Redirecting to your report...'
                : timedOut
                  ? 'This is taking longer than usual. Your report will appear in History when it is ready.'
                  : 'This usually takes 1-2 minutes'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="w-full bg-gray-100 rounded-full h-3 mb-6 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${
                failed ? 'bg-red-500' : analysisStatus === 'complete' ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="space-y-4">
            {STEPS.map((step, i) => {
              const isDone = currentStep > i || analysisStatus === 'complete';
              const isActive = currentStep === i && analysisStatus !== 'complete' && !failed;

              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    isDone
                      ? 'bg-green-100 text-green-600'
                      : isActive
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-400'
                  }`}>
                    {isDone ? '✓' : step.icon}
                  </div>
                  <span className={`text-sm font-medium ${
                    isDone
                      ? 'text-green-600'
                      : isActive
                        ? 'text-blue-600'
                        : 'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                  {isActive && (
                    <div className="ml-auto">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/partners')}
            className={failed || timedOut
              ? "px-6 py-2 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition"
              : "text-sm text-gray-400 hover:text-gray-600 transition"
            }
          >
            {failed || timedOut ? 'Back to Partners' : "Skip - I'll check the report later"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{background: '#f8f9fa'}}>
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    }>
      <ProcessingContent />
    </Suspense>
  );
}
