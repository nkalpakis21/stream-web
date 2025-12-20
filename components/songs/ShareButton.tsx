'use client';

import { useState } from 'react';

interface ShareButtonProps {
  url: string;
  title: string;
  artistName?: string;
}

export function ShareButton({ url, title, artistName }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const isMobile = () => {
    // Check if device is mobile/tablet
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || ('ontouchstart' in window);
  };

  const handleShare = async () => {
    const shareText = artistName ? `${title} by ${artistName}` : title;
    
    // On mobile: use native share API
    if (isMobile() && navigator.share) {
      try {
        await navigator.share({
          title: shareText,
          text: `Check out ${shareText} on Stream ⭐`,
          url: url,
        });
        return;
      } catch (error) {
        // User cancelled - do nothing
        if ((error as Error).name === 'AbortError') {
          return;
        }
        // If share fails, fall through to copy
      }
    }

    // On web: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card hover:bg-muted hover:border-accent/20 transition-all duration-200 text-sm font-medium text-foreground group"
      aria-label="Share song"
    >
      {copied ? (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 18h16" />
          </svg>
          <span>Share</span>
        </>
      )}
    </button>
  );
}

