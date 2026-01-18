'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { X, Search, UserPlus, Loader2, Check, Users } from 'lucide-react';
import { getAvatarGradient, getInitials } from '@/lib/utils/avatar';
import type { AIArtistDocument } from '@/types/firestore';
import Image from 'next/image';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChat: (artistIds: string[], type: 'direct' | 'group') => void;
}

// Serialized artist for client
type SerializedArtistDocument = Omit<AIArtistDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export function NewChatModal({ isOpen, onClose, onStartChat }: NewChatModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [artists, setArtists] = useState<SerializedArtistDocument[]>([]);
  const [followedArtists, setFollowedArtists] = useState<SerializedArtistDocument[]>([]);
  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFollowed, setLoadingFollowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load followed artists on modal open
  useEffect(() => {
    if (!isOpen || !user) {
      setFollowedArtists([]);
      setSelectedArtistIds([]);
      setSearchQuery('');
      setError(null);
      setArtists([]);
      return;
    }

    const loadFollowedArtists = async () => {
      setLoadingFollowed(true);
      try {
        const params = new URLSearchParams({
          userId: user.uid,
        });

        const response = await fetch(`/api/artists/followed?${params.toString()}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to load followed artists');
        }

        const data = await response.json();
        setFollowedArtists(data.artists || []);
      } catch (err) {
        console.error('Failed to load followed artists:', err);
        // Don't show error for followed artists, just log it
      } finally {
        setLoadingFollowed(false);
      }
    };

    loadFollowedArtists();
  }, [isOpen, user]);

  // Search artists when query changes
  useEffect(() => {
    if (!isOpen || !user) return;

    const trimmedQuery = searchQuery.trim();
    
    // If query is empty, clear search results
    if (trimmedQuery.length === 0) {
      setArtists([]);
      setError(null);
      return;
    }

    // Debounce search
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams({
          query: trimmedQuery,
          limit: '20',
          excludeOwnerId: user.uid, // Exclude user's own artists
        });

        const response = await fetch(`/api/artists/search?${params.toString()}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to search artists');
        }

        const data = await response.json();
        setArtists(data.artists || []);
      } catch (err) {
        console.error('Failed to search artists:', err);
        setError(err instanceof Error ? err.message : 'Failed to search artists');
        setArtists([]);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, isOpen, user]);

  const handleToggleArtist = useCallback((artistId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setSelectedArtistIds(prev => {
      if (prev.includes(artistId)) {
        return prev.filter(id => id !== artistId);
      } else {
        return [...prev, artistId];
      }
    });
  }, []);

  const handleRemoveSelected = useCallback((artistId: string) => {
    setSelectedArtistIds(prev => prev.filter(id => id !== artistId));
  }, []);

  const handleStartChat = useCallback(() => {
    if (selectedArtistIds.length === 0) return;

    const type = selectedArtistIds.length === 1 ? 'direct' : 'group';
    onStartChat(selectedArtistIds, type);
    onClose();
  }, [selectedArtistIds, onStartChat, onClose]);

  const isArtistSelected = (artistId: string) => selectedArtistIds.includes(artistId);

  if (!isOpen) return null;

  const showFollowedArtists = searchQuery.trim().length === 0;
  const displayArtists = showFollowedArtists ? followedArtists : artists;
  const hasResults = displayArtists.length > 0;

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

        {/* Selected Artists Chips */}
        {selectedArtistIds.length > 0 && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {selectedArtistIds.length === 1 ? 'Direct Message' : `Group Chat (${selectedArtistIds.length + 1})`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedArtistIds.map(artistId => {
                const artistDoc = [...followedArtists, ...artists].find(a => a.id === artistId);
                const artistName = artistDoc?.name || 'Artist';
                const avatarBg = getAvatarGradient(artistName);
                const initials = getInitials(artistName);

                return (
                  <div
                    key={artistId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-full text-sm"
                  >
                    {artistDoc?.avatarURL ? (
                      <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                        <Image
                          src={artistDoc.avatarURL}
                          alt={artistName}
                          width={20}
                          height={20}
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div 
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: avatarBg }}
                      >
                        <span className="text-white font-semibold text-xs">
                          {initials}
                        </span>
                      </div>
                    )}
                    <span className="truncate max-w-[120px]">{artistName}</span>
                    <button
                      onClick={() => handleRemoveSelected(artistId)}
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
            placeholder="Search artists you follow..."
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            autoFocus
            disabled // Disabled until artist search is implemented
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingFollowed && showFollowedArtists ? (
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
              {showFollowedArtists 
                ? 'You\'re not following any artists yet' 
                : 'No artists found'}
            </div>
          ) : (
            <div className="space-y-1">
              {showFollowedArtists ? (
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">
                    Artists you follow
                  </h3>
                </div>
              ) : (
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">
                    Search results
                  </h3>
                </div>
              )}
              {displayArtists.map((artist) => {
                const artistName = artist.name;
                const avatarBg = getAvatarGradient(artistName);
                const initials = getInitials(artistName);
                const selected = isArtistSelected(artist.id);

                return (
                  <button
                    key={artist.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleToggleArtist(artist.id, e);
                    }}
                    className={`w-full p-3 text-left hover:bg-muted rounded-lg transition-colors flex items-center gap-3 ${
                      selected ? 'bg-muted border-2 border-accent' : ''
                    }`}
                  >
                    {artist.avatarURL ? (
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        <Image
                          src={artist.avatarURL}
                          alt={artistName}
                          width={40}
                          height={40}
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: avatarBg }}
                      >
                        <span className="text-white font-semibold text-sm">
                          {initials}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{artistName}</div>
                      {artist.lore && (
                        <div className="text-sm text-muted-foreground truncate">
                          {artist.lore}
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
        {selectedArtistIds.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={handleStartChat}
              className="w-full px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span>
                {selectedArtistIds.length === 1 
                  ? 'Start Direct Message' 
                  : `Start Group Chat (${selectedArtistIds.length + 1})`}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
