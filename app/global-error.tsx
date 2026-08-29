'use client';

import './globals.css';
import { BrandError } from '@/components/states/BrandError';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <BrandError reset={reset} />
      </body>
    </html>
  );
}
