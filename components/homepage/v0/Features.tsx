import { Wand2, Users, Shield, Zap } from 'lucide-react';

const features = [
  {
    icon: Wand2,
    title: 'AI Composition',
    description:
      'Transform your ideas into fully produced tracks with intelligent AI that understands music theory and style.',
  },
  {
    icon: Users,
    title: 'AI Collaboration',
    description:
      'Work alongside AI artists that adapt to your creative vision. Iterate, refine, and perfect together.',
  },
  {
    icon: Shield,
    title: 'Full Ownership',
    description:
      'Every track you create is 100% yours. No royalty splits, no licensing headaches. Your music, your rights.',
  },
  {
    icon: Zap,
    title: 'Instant Export',
    description:
      'Export in studio-quality formats ready for streaming, sync licensing, or distribution. No waiting.',
  },
];

export function Features() {
  return (
    <section className="relative py-24">
      {/* Background */}
      <div className="absolute inset-0 bg-secondary/20" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4 text-balance">
            Everything you need to create
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto text-pretty">
            Professional-grade tools powered by AI, built for creators who want full control.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
