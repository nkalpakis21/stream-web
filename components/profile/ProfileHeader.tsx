'use client';

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { getUser, updateUserDisplayName } from '@/lib/services/users';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { Edit2, Check, X, Loader2 } from 'lucide-react';

interface ProfileHeaderProps {
  user: User;
  stats: {
    songsCount: number;
    artistsCount: number;
    totalPlays: number;
  };
}

export function ProfileHeader({ user, stats }: ProfileHeaderProps) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toasts, showToast, dismissToast } = useToast();

  // Load display name from Firestore
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadDisplayName = async () => {
      try {
        const userDoc = await getUser(user.uid);
        if (userDoc) {
          setDisplayName(userDoc.displayName);
          setEditValue(userDoc.displayName || '');
        }
      } catch (error) {
        console.error('Failed to load display name:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDisplayName();
  }, [user]);

  const handleSaveDisplayName = async () => {
    if (!user || saving) return;

    const trimmed = editValue.trim();

    if (trimmed.length < 2) {
      showToast('Display name must be at least 2 characters', 'error');
      return;
    }

    if (trimmed.length > 30) {
      showToast('Display name must be 30 characters or less', 'error');
      return;
    }

    const allowedPattern = /^[a-zA-Z0-9\s\-_]+$/;
    if (!allowedPattern.test(trimmed)) {
      showToast('Display name can only contain letters, numbers, spaces, hyphens, and underscores', 'error');
      return;
    }

    if (trimmed === displayName) {
      setEditingDisplayName(false);
      return;
    }

    setSaving(true);
    try {
      await updateUserDisplayName(user.uid, trimmed, user.email || undefined);
      setDisplayName(trimmed);
      setEditingDisplayName(false);
      showToast('Display name updated successfully', 'success');
    } catch (error) {
      console.error('Failed to update display name:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update display name';
      showToast(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditValue(displayName || '');
    setEditingDisplayName(false);
  };

  const currentDisplayName = displayName || user.email?.split('@')[0] || 'User';
  const avatarUrl = user.photoURL;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="mb-12">
        {/* Main Header Section */}
        <div className="mb-10">
          {/* User Info */}
          <div className="flex-1 min-w-0">
            {editingDisplayName ? (
              <div className="space-y-3 mb-2">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Enter display name"
                    maxLength={30}
                    className="flex-1 px-4 py-2 text-3xl sm:text-4xl font-semibold tracking-tight border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    disabled={saving}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveDisplayName}
                    disabled={saving || !editValue.trim()}
                    className="p-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Save display name"
                  >
                    {saving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    aria-label="Cancel editing"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {editValue.length}/30 characters
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 group mb-2">
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                  {currentDisplayName}
                </h1>
                <button
                  onClick={() => {
                    setEditValue(displayName || '');
                    setEditingDisplayName(true);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted opacity-0 group-hover:opacity-100"
                  aria-label="Edit display name"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-8">
          <div>
            <div className="text-2xl font-semibold text-foreground mb-0.5">
              {stats.songsCount}
            </div>
            <div className="text-xs text-muted-foreground">
              Songs
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-foreground mb-0.5">
              {stats.artistsCount}
            </div>
            <div className="text-xs text-muted-foreground">
              Artists
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-foreground mb-0.5">
              {stats.totalPlays.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              Plays
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
