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
  const triggeredRef = useRef(false);

  // Trigger analysis API
  useEffect(() => {
    if (!callId || triggeredRef.current) return;
    triggeredRef.current = true;

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setFailed(true);
          setFailMessage(data.error || `Server error: ${res.status}`);
        }
      })
      .catch((err) => {
        setFailed(true);
        setFailMessage(err.message || 'Network error');
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

  // Timeout after 2 minutes
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (analysisStatus !== 'complete' && !failed) {
        setFailed(true);
        setFailMessage('Analysis timed out. Check History later for results.');
      }
    }, 120000);
    return () => clearTimeout(timeout);
  }, [analysisStatus, failed]);

  const currentStep = getStepIndex(analysisStatus);
  const progress = failed ? 100 : ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{background: '#f8f9fa'}}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">
            {failed ? '❌' : analysisStatus === 'complete' ? '✅' : '⏳'}
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {failed
              ? 'Analysis Failed'
              : analysisStatus === 'complete'
                ? 'Report Ready!'
                : 'Processing Your Call'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {failed
              ? failMessage
              : analysisStatus === 'complete'
                ? 'Redirecting to your report...'
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
            className={failed
              ? "px-6 py-2 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition"
              : "text-sm text-gray-400 hover:text-gray-600 transition"
            }
          >
            {failed ? 'Back to Partners' : "Skip - I'll check the report later"}
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
