'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { getInitials, headerChipLabel } from '@/lib/utils/avatar';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { NotificationDocument } from '@/types/firestore';
import { getUnreadNotifications } from '@/lib/services/notifications';
import { NotificationsDropdown } from './NotificationsDropdown';
import { WalletConnectSection } from './WalletConnectSection';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'You';
  const avatarUrl = user?.photoURL;
  const chipName = headerChipLabel(user?.displayName);

  // Fetch unread notifications count
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const q = query(
      collection(db, COLLECTIONS.notifications),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const items = snapshot.docs
          .map(doc => doc.data() as NotificationDocument)
          .filter(notif => !notif.deletedAt);
        setUnreadCount(items.length);
      },
      error => {
        console.error('[UserMenu] Error listening to notifications:', error);
        // On error, try to fetch count manually as fallback
        getUnreadNotifications(user.uid)
          .then(notifications => setUnreadCount(notifications.length))
          .catch(err => console.error('[UserMenu] Failed to fetch notification count:', err));
      }
    );

    return unsubscribe;
  }, [user]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-wallet-picker]')) {
        return;
      }
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    router.push('/');
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center gap-2 pl-0.5 pr-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{
          minHeight: 44,
          borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
        }}
        aria-label="User menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="relative shrink-0" style={{ width: 36, height: 36 }}>
          <span
            className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
            style={{
              background: 'var(--surface-2)',
              boxShadow: '0 0 0 2px var(--accent)',
            }}
          >
            {avatarUrl ? (
              // Auth / Storage photo. Keep circular crop.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                width={36}
                height={36}
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className="font-semibold"
                style={{ fontSize: 12, lineHeight: '16px', color: 'var(--ink)' }}
              >
                {getInitials(displayName)}
              </span>
            )}
          </span>
          {unreadCount > 0 ? (
            <span
              className="absolute z-10 flex items-center justify-center font-semibold"
              style={{
                top: -4,
                right: -4,
                width: 18,
                height: 18,
                borderRadius: 999,
                background: 'var(--accent)',
                color: 'var(--accent-ink)',
                fontSize: 10,
                lineHeight: '18px',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </span>
        <span
          className="max-w-[7.5rem] truncate font-medium"
          style={{ fontSize: 13, lineHeight: '18px', color: 'var(--ink)' }}
        >
          {chipName}
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div
            className="absolute right-0 top-[calc(100%+0.75rem)] w-[min(260px,calc(100vw-2rem))] bg-card border border-border/60 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* User Info Header */}
            <div className="px-4 py-3 border-b border-border/40">
              <div className="font-medium text-foreground text-sm mb-0.5">
                {displayName}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {user.email}
              </div>
            </div>

            {/* Wallet — quiet, no chain jargon. Stay open so connect flips live. */}
            <div className="px-4 py-3 border-b border-border/40">
              <WalletConnectSection />
            </div>

            {/* Menu Items */}
            <div className="py-1.5">
              <Link
                href="/feed"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  pathname?.startsWith('/feed')
                    ? 'text-foreground bg-muted/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Feed
              </Link>
              <Link
                href="/chat"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  pathname?.startsWith('/chat')
                    ? 'text-foreground bg-muted/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Chat
              </Link>
              <Link
                href="/me"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  pathname?.startsWith('/me')
                    ? 'text-foreground bg-muted/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8a3 3 0 100 6 3 3 0 000-6zm6 1.5a3 3 0 100 6 3 3 0 000-6z" />
                </svg>
                Your coins
              </Link>
              <Link
                href="/dashboard"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  pathname?.startsWith('/dashboard')
                    ? 'text-foreground bg-muted/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Studio
              </Link>

              <button
                onClick={() => {
                  setIsOpen(false);
                  setNotificationsOpen(true);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors duration-200 relative"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold leading-none text-accent-ink bg-accent rounded-xl min-w-[18px]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-border/40" />

            {/* Sign Out */}
            <div className="py-1.5">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors duration-200 text-left"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}

      {/* Notifications Dropdown */}
      <NotificationsDropdown 
        isOpen={notificationsOpen} 
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}

