'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[App] Unhandled error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
      <div className="text-center max-w-sm" role="alert">
        <div className="text-5xl mb-4">😕</div>
        <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-500 mt-2">Please try again. If it keeps happening, reload the app.</p>
        <button
          onClick={reset}
          className="mt-6 px-6 py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
