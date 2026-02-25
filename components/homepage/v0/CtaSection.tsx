'use client';

import { HeroCTA } from '@/components/homepage/HeroCTA';

export function CtaSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative rounded-3xl overflow-hidden border border-border/30 bg-card p-12 md:p-20 text-center">
          {/* Glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary/8 blur-[100px]" />
          </div>

          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-6 text-balance">
              Ready to make your first track?
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-10 text-lg text-pretty">
              Join thousands of creators making real music with AI. Free to start, no credit card required.
            </p>
            <div className="flex justify-center">
              <HeroCTA variant="default" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
