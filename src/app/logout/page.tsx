'use client';

import { useEffect } from 'react';
import { useAuthContext } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function LogoutPage() {
  const { signOut } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    signOut().then(() => router.replace('/login'));
  }, [signOut, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{background: '#f8f9fa'}}>
      <p className="text-gray-500">Signing out...</p>
    </div>
  );
}
