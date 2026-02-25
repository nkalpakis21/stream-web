'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { HeroCTA } from '@/components/homepage/HeroCTA';
import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-20">
      {/* Background glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-primary/3 blur-[100px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 bg-secondary/30 mb-8 backdrop-blur-sm">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground">AI-Powered Music Creation</span>
        </div>

        {/* Heading */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-balance leading-[1.05] mb-6">
          <span className="text-foreground">Create real music</span>
          <br />
          <span className="text-foreground">with AI </span>
          <span className="text-primary">in seconds.</span>
        </h1>

        {/* Subheading */}
        <p className="max-w-xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed mb-10 text-pretty">
          From first idea to finished track. Collaborate with AI artists and own everything you create.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <HeroCTA variant="default" />
          <Link
            href="/discover"
            className="flex items-center gap-2 px-8 py-4 border border-border/60 rounded-xl text-base text-muted-foreground hover:text-foreground hover:border-border transition-all hover:bg-secondary/30"
          >
            <span>Discover</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Audio Visualizer */}
        <div className="mt-16">
          <AudioVisualizer />
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 mt-12">
          {[
            { value: '50K+', label: 'Tracks Created' },
            { value: '12K+', label: 'Artists' },
            { value: '98%', label: 'Ownership' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-foreground font-mono">{stat.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
