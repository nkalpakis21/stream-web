'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { NotificationsDropdown } from './NotificationsDropdown';

export function NotificationsBell() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors group"
        aria-label="Notifications"
      >
        <svg
          className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground group-hover:text-foreground transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      </button>
      
      <NotificationsDropdown isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}
