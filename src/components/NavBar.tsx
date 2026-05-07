'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/partners', label: 'Practice', icon: '🎯' },
  { href: '/history', label: 'Reports', icon: '📊' },
  { href: '/profile', label: 'Me', icon: '⚡' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-gray-100">
      <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-4">
        {tabs.map(tab => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all duration-200 ${
                active
                  ? 'text-[var(--accent-coral)] scale-105'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-[10px] font-semibold tracking-wide uppercase">{tab.label}</span>
              {active && (
                <div className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[var(--accent-coral)] rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
