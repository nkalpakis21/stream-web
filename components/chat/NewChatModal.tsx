'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useUsersDisplayNames } from '@/hooks/useUserDisplayName';
import { X, Search, UserPlus, Loader2, Check, Users } from 'lucide-react';
import { getAvatarGradient, getInitials } from '@/lib/utils/avatar';
import type { UserDocument } from '@/types/firestore';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChat: (userIds: string[], type: 'direct' | 'group') => void;
}

// Serialized user for client
type SerializedUserDocument = Omit<UserDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export function NewChatModal({ isOpen, onClose, onStartChat }: NewChatModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<SerializedUserDocument[]>([]);
  const [followedUsers, setFollowedUsers] = useState<SerializedUserDocument[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFollowed, setLoadingFollowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get display names for users
  const allUserIds = [...users, ...followedUsers].map(u => u.id);
  const { displayNames } = useUsersDisplayNames(allUserIds);

  // Load followed users on modal open
  useEffect(() => {
    if (!isOpen || !user) {
      setFollowedUsers([]);
      setSelectedUserIds([]);
      setSearchQuery('');
      setError(null);
      return;
    }

    const loadFollowedUsers = async () => {
      setLoadingFollowed(true);
      try {
        const params = new URLSearchParams({
          userId: user.uid,
        });

        const response = await fetch(`/api/users/followed?${params.toString()}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to load followed users');
        }

        const data = await response.json();
        setFollowedUsers(data.users || []);
      } catch (err) {
        console.error('Failed to load followed users:', err);
        // Don't show error for followed users, just log it
      } finally {
        setLoadingFollowed(false);
      }
    };

    loadFollowedUsers();
  }, [isOpen, user]);

  // Debounced search
  useEffect(() => {
    if (!isOpen || !user) {
      setUsers([]);
      return;
    }

    const trimmedQuery = searchQuery.trim();
    
    if (!trimmedQuery || trimmedQuery.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    // Debounce search
    const debounceTimer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams({
          query: trimmedQuery,
          limit: '10',
          excludeUserId: user.uid,
        });

        const response = await fetch(`/api/users/search?${params.toString()}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to search users');
        }

        const data = await response.json();
        setUsers(data.users || []);
      } catch (err) {
        console.error('Failed to search users:', err);
        setError(err instanceof Error ? err.message : 'Failed to search users');
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, isOpen, user]);

  const handleToggleUser = useCallback((userId: string) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  }, []);

  const handleRemoveSelected = useCallback((userId: string) => {
    setSelectedUserIds(prev => prev.filter(id => id !== userId));
  }, []);

  const handleStartChat = useCallback(() => {
    if (selectedUserIds.length === 0) return;

    const type = selectedUserIds.length === 1 ? 'direct' : 'group';
    onStartChat(selectedUserIds, type);
    onClose();
  }, [selectedUserIds, onStartChat, onClose]);

  const isUserSelected = (userId: string) => selectedUserIds.includes(userId);

  if (!isOpen) return null;

  const showFollowedUsers = searchQuery.trim().length === 0;
  const displayUsers = showFollowedUsers ? followedUsers : users;
  const hasResults = displayUsers.length > 0;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-card border border-border rounded-lg w-full max-w-md p-6 shadow-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">New Chat</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Users Chips */}
        {selectedUserIds.length > 0 && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {selectedUserIds.length === 1 ? 'Direct Message' : `Group Chat (${selectedUserIds.length + 1})`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedUserIds.map(userId => {
                const userDoc = [...followedUsers, ...users].find(u => u.id === userId);
                const displayName = userDoc 
                  ? (displayNames.get(userId) || userDoc.displayName || userDoc.email?.split('@')[0] || 'User')
                  : 'User';
                const avatarBg = getAvatarGradient(displayName);
                const initials = getInitials(displayName);

                return (
                  <div
                    key={userId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-full text-sm"
                  >
                    <div 
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: avatarBg }}
                    >
                      <span className="text-white font-semibold text-xs">
                        {initials}
                      </span>
                    </div>
                    <span className="truncate max-w-[120px]">{displayName}</span>
                    <button
                      onClick={() => handleRemoveSelected(userId)}
                      className="ml-1 hover:text-foreground text-muted-foreground transition-colors"
                      aria-label="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by display name..."
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingFollowed && showFollowedUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p>{error}</p>
            </div>
          ) : !hasResults ? (
            <div className="text-center py-8 text-muted-foreground">
              {showFollowedUsers 
                ? 'You\'re not following any artists yet' 
                : searchQuery.trim() 
                  ? 'No users found' 
                  : 'Start typing to search for users'}
            </div>
          ) : (
            <div className="space-y-1">
              {showFollowedUsers && (
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">
                    People you follow
                  </h3>
                </div>
              )}
              {displayUsers.map((userResult) => {
                const displayName = displayNames.get(userResult.id) || userResult.displayName || userResult.email?.split('@')[0] || 'User';
                const avatarBg = getAvatarGradient(displayName);
                const initials = getInitials(displayName);
                const selected = isUserSelected(userResult.id);

                return (
                  <button
                    key={userResult.id}
                    onClick={() => handleToggleUser(userResult.id)}
                    className={`w-full p-3 text-left hover:bg-muted rounded-lg transition-colors flex items-center gap-3 ${
                      selected ? 'bg-muted border-2 border-accent' : ''
                    }`}
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: avatarBg }}
                    >
                      <span className="text-white font-semibold text-sm">
                        {initials}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{displayName}</div>
                      {userResult.email && (
                        <div className="text-sm text-muted-foreground truncate">
                          {userResult.email}
                        </div>
                      )}
                    </div>
                    {selected ? (
                      <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-accent-foreground" />
                      </div>
                    ) : (
                      <UserPlus className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Start Chat Button */}
        {selectedUserIds.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={handleStartChat}
              className="w-full px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span>
                {selectedUserIds.length === 1 
                  ? 'Start Direct Message' 
                  : `Start Group Chat (${selectedUserIds.length + 1})`}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
