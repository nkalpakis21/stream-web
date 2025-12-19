'use client';

import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { NotificationsBell } from '@/components/navigation/NotificationsBell';

export function Nav() {
  const { user, signOut } = useAuth();

  return (
    <nav className="border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="text-2xl font-bold">
            Stream ⭐
          </Link>
          <div className="flex gap-4 items-center">
            <Link
              href="/discover"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Discover
            </Link>
            <Link
              href="/artists"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Artists
            </Link>
            {user ? (
              <>
                <NotificationsBell />
                <Link
                  href="/create"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Create
                </Link>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {user.email}
                  </span>
                  <button
                    onClick={signOut}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <Link
                href="/create"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

