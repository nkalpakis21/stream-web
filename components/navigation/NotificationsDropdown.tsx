'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { markNotificationRead, getUnreadNotifications } from '@/lib/services/notifications';
import { useRouter } from 'next/navigation';
import type { NotificationDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';

// Serialized notification for client components
type SerializedNotificationDocument = Omit<NotificationDocument, 'createdAt'> & {
  createdAt: number;
};

interface NotificationsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationsDropdown({ isOpen, onClose }: NotificationsDropdownProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<SerializedNotificationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !isOpen) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // Use getDocs instead of onSnapshot to avoid duplicate listeners
    const loadNotifications = async () => {
      setLoading(true);
      try {
        const unread = await getUnreadNotifications(user.uid);
        setNotifications(
          unread.map(notif => ({
            ...notif,
            createdAt: notif.createdAt.toMillis(),
          }))
        );
      } catch (error) {
        console.error('Failed to load notifications:', error);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [user, isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const handleNotificationClick = async (notification: SerializedNotificationDocument) => {
    try {
      // Mark as read
      await markNotificationRead(notification.id);
      
      // Remove from local state immediately for better UX
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      
      // Small delay to ensure Firestore update propagates before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Navigate to song
      router.push(`/songs/${notification.songId}`);
      onClose();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      // Still navigate even if marking as read fails
      router.push(`/songs/${notification.songId}`);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dropdown */}
      <div
        ref={dropdownRef}
        className="fixed right-4 sm:right-6 md:right-8 top-[72px] sm:top-[80px] w-[calc(100vw-2rem)] sm:w-[360px] md:w-[400px] max-h-[500px] bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50">
          <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[420px]">
          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-4xl mb-3">🔔</div>
              <p className="text-sm text-muted-foreground">No new notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((notification) => {
                const timeAgo = formatDistanceToNow(new Date(notification.createdAt), {
                  addSuffix: true,
                });

                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className="w-full px-6 py-4 text-left hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                        <span className="text-lg">🎵</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                          Your song is ready!
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {timeAgo}
                        </p>
                      </div>
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-accent mt-2" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-6 py-3 border-t border-border/50 bg-muted/30">
            <p className="text-xs text-muted-foreground text-center">
              {notifications.length} unread notification{notifications.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

