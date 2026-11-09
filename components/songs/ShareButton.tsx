'use client';

import { useState } from 'react';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { reportClientFunnelEvent } from '@/lib/analytics/reportFunnel';
import { shareUrl } from '@/lib/brand/site';

interface ShareButtonProps {
  url: string;
  title: string;
  artistName?: string;
  songId?: string;
  artistId?: string;
}

export function ShareButton({ url, title, artistName, songId, artistId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();
  const publicLink = url.startsWith('http') ? url : shareUrl(url);

  const markShared = () => {
    setCopied(true);
    showToast('Link copied', 'success');
    setTimeout(() => setCopied(false), 2000);
    try {
      reportClientFunnelEvent('song_shared', {
        ...(songId ? { songId } : {}),
        ...(artistId ? { artistId } : {}),
      });
    } catch (error) {
      console.error('[funnel] song_shared', error instanceof Error ? error.message : 'failed');
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      markShared();
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = publicLink;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        markShared();
      } finally {
        document.body.removeChild(textArea);
      }
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <button
        type="button"
        onClick={handleShare}
        className="listen-btn-ghost min-h-11"
        aria-label="Share"
      >
        {copied ? 'Copied' : 'Share'}
      </button>
    </>
  );
}
