'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { Edit2, Check, X, Loader2 } from 'lucide-react';

interface EditArtistNameProps {
  artistId: string;
  currentName: string;
  onUpdate?: (newName: string) => void;
}

export function EditArtistName({ artistId, currentName, onUpdate }: EditArtistNameProps) {
  const { user } = useAuth();
  const [name, setName] = useState(currentName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  // Update name when currentName prop changes
  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const handleSave = async () => {
    if (!user || saving) return;

    const trimmed = name.trim();

    // Validation
    if (trimmed.length < 2) {
      showToast('Artist name must be at least 2 characters', 'error');
      return;
    }

    if (trimmed.length > 50) {
      showToast('Artist name must be 50 characters or less', 'error');
      return;
    }

    const allowedPattern = /^[a-zA-Z0-9\s\-_]+$/;
    if (!allowedPattern.test(trimmed)) {
      showToast('Artist name can only contain letters, numbers, spaces, hyphens, and underscores', 'error');
      return;
    }

    // Check if unchanged
    if (trimmed === currentName) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/artists/${artistId}/name`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user.uid, // Pass user ID in header
        },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update artist name');
      }

      const data = await response.json();
      setName(data.artist.name);
      setEditing(false);
      showToast('Artist name updated successfully', 'success');
      if (onUpdate) {
        onUpdate(data.artist.name);
      }
    } catch (error) {
      console.error('Failed to update artist name:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update artist name';
      showToast(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(currentName);
    setEditing(false);
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter artist name"
            maxLength={50}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            disabled={saving}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="p-1.5 text-accent hover:bg-accent/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Save"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-4xl lg:text-5xl font-bold tracking-tight">{name}</span>
          <button
            onClick={() => setEditing(true)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
            aria-label="Edit artist name"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
