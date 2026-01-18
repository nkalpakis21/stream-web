'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { updateUserDisplayName, getUser } from '@/lib/services/users';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { Edit2, Check, X, Loader2 } from 'lucide-react';

interface DisplayNameFormProps {
  onUpdate?: () => void;
}

export function DisplayNameForm({ onUpdate }: DisplayNameFormProps) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toasts, showToast, dismissToast } = useToast();

  // Load current display name
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadDisplayName = async () => {
      try {
        const userDoc = await getUser(user.uid);
        if (userDoc) {
          setCurrentDisplayName(userDoc.displayName);
          setDisplayName(userDoc.displayName || '');
        }
      } catch (error) {
        console.error('Failed to load display name:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDisplayName();
  }, [user]);

  const handleSave = async () => {
    if (!user || saving) return;

    const trimmed = displayName.trim();

    // Validation
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

    // Check if unchanged
    if (trimmed === currentDisplayName) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await updateUserDisplayName(user.uid, trimmed);
      setCurrentDisplayName(trimmed);
      setEditing(false);
      showToast('Display name updated successfully', 'success');
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to update display name:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update display name';
      showToast(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(currentDisplayName || '');
    setEditing(false);
  };

  if (!user || loading) {
    return (
      <div className="p-4">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="p-4 border border-border rounded-lg bg-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Display Name</h3>
            <p className="text-xs text-muted-foreground">
              This name will be shown in comments, chat, and other places
            </p>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name"
                maxLength={30}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                disabled={saving}
                autoFocus
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {displayName.length}/30 characters
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !displayName.trim()}
                className="px-3 py-1.5 text-sm bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3" />
                    Save
                  </>
                )}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {currentDisplayName || (
                  <span className="text-muted-foreground italic">
                    {user.email?.split('@')[0] || 'Not set'}
                  </span>
                )}
              </p>
              {!currentDisplayName && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Using email username as fallback
                </p>
              )}
            </div>
            <button
              onClick={() => setEditing(true)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
              aria-label="Edit display name"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
