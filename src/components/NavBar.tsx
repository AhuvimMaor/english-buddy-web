'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthContext } from './AuthProvider';

const tabs = [
  { href: '/partners', label: 'Partners', icon: '🏠' },
  { href: '/history', label: 'History', icon: '📋' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export function NavBar() {
  const pathname = usePathname();
  const { profile } = useAuthContext();

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-2xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/partners" className="font-bold text-lg text-gray-900">
          🗣️ English Buddy
        </Link>

        <div className="flex items-center gap-1">
          {tabs.map(tab => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
