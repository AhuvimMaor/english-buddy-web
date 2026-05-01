'use client';

import { createContext, useContext } from 'react';
import { useAuth } from '@/hooks/useAuth';

type AuthContextType = ReturnType<typeof useAuth>;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authValue = useAuth();
  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be within AuthProvider');
  return ctx;
}
