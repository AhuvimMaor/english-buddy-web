'use client';

import { useState } from 'react';
import { useAuthContext } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EnglishLevel } from '@/types';

const LEVELS: { value: EnglishLevel; label: string; desc: string }[] = [
  { value: 'beginner', label: '🌱 Beginner', desc: 'Just starting out' },
  { value: 'intermediate', label: '📚 Intermediate', desc: 'Can hold basic conversations' },
  { value: 'advanced', label: '🎯 Advanced', desc: 'Fluent but want to improve' },
];

export default function RegisterPage() {
  const { signUp } = useAuthContext();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [level, setLevel] = useState<EnglishLevel>('beginner');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signUp(email, password, name);
      router.push('/partners');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold">🗣️</h1>
          <h2 className="text-2xl font-bold text-gray-900 mt-2">Create Account</h2>
          <p className="text-gray-500 mt-1">Start practicing English today</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <input
            type="password"
            placeholder="Password (6+ characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />

          <div>
            <p className="font-semibold text-gray-700 mb-2">English Level</p>
            <div className="space-y-2">
              {LEVELS.map(l => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLevel(l.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                    level === l.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="font-medium">{l.label}</span>
                  <span className="text-gray-500 text-sm ml-2">{l.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-50 transition"
          >
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center mt-4 text-gray-500 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-500 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
