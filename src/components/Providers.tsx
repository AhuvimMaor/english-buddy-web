'use client';

import { useEffect } from 'react';
import { AuthProvider } from './AuthProvider';
import { IncomingCallListener } from './IncomingCallListener';
import { connectEmulators } from '@/lib/firebase';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    connectEmulators();
  }, []);

  return (
    <AuthProvider>
      <IncomingCallListener />
      {children}
    </AuthProvider>
  );
}
