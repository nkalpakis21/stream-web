'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { NotificationDocument } from '@/types/firestore';
import { useAuth } from '@/components/providers/AuthProvider';

export function NotificationsBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDocument[]>([]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      const items = snapshot.docs.map(doc => doc.data() as NotificationDocument);
      setNotifications(items);
    });

    return unsubscribe;
  }, [user]);

  if (!user) {
    return null;
  }

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      <div className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center">
        <span className="text-lg">🔔</span>
      </div>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-red-600 rounded-full">
          {unreadCount}
        </span>
      )}
    </div>
  );
}


