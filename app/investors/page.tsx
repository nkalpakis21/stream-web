'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Nav } from '@/components/navigation/Nav';
import { Logo } from '@/components/branding/Logo';

// Email whitelist - add investor emails here
const INVESTOR_EMAIL_WHITELIST = [
  // Add investor emails here, e.g.:
  // 'investor@example.com',
  // 'partner@vc.com',
  'nkalpakis21@gmail.com',
  'mshaffer13@msn.com',
  'jjketellapper@gmail.com',
  ''
];

function InvestorsContent() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAuthorized(false);
      return;
    }

    // Check if user email is in whitelist
    const userEmail = user.email?.toLowerCase();
    const isAuthorized = userEmail ? INVESTOR_EMAIL_WHITELIST.includes(userEmail) : false;
    setAuthorized(isAuthorized);

    if (!isAuthorized) {
      // Optionally redirect after showing error
      // router.push('/');
    }
  }, [user, authLoading, router]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const nextSlide = () => {
    setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1));
  };

  const prevSlide = () => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  if (authLoading || authorized === null) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold mb-4">Investor Access</h1>
            <p className="text-muted-foreground mb-6">
              Please sign in to access the pitch deck
            </p>
            <button
              onClick={handleSignIn}
              className="px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
            <p className="text-muted-foreground mb-2">
              This page is restricted to authorized investors only.
            </p>
            <p className="text-sm text-muted-foreground">
              If you believe you should have access, please contact us.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Slide content
  const slides = [
    // Slide 1: Title
    {
      title: 'Stream Star',
      subtitle: 'The Future of Music Creation',
      tagline: 'Where AI Artists Meet Social & Crypto',
      content: null,
    },
    // Slide 2: Problem
    {
      title: 'The Problem',
      content: (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-card rounded-lg border">
              <h3 className="font-semibold mb-2">Music Creation is Broken</h3>
              <p className="text-sm text-muted-foreground">
                Expensive, gatekept, centralized. Artists struggle to monetize with middlemen taking 70%+ of revenue.
              </p>
            </div>
            <div className="p-6 bg-card rounded-lg border">
              <h3 className="font-semibold mb-2">Discovery is Broken</h3>
              <p className="text-sm text-muted-foreground">
                Algorithms favor labels, not creators. AI music exists but lacks ownership, social, and monetization.
              </p>
            </div>
          </div>
          <div className="text-center pt-4">
            <p className="text-2xl font-bold">$26B Music Industry</p>
            <p className="text-muted-foreground">+ $50B Creator Economy + $1T Crypto Market</p>
          </div>
        </div>
      ),
    },
    // Slide 3: Vision
    {
      title: 'Our Vision',
      content: (
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-xl mb-4">Not just another AI song generator</p>
            <p className="text-xl mb-4">Not just another Spotify</p>
            <div className="flex flex-wrap justify-center gap-4 my-8">
              <div className="px-6 py-3 bg-accent/10 rounded-lg border border-accent/20">
                <span className="font-semibold">AI</span>
              </div>
              <div className="px-6 py-3 bg-accent/10 rounded-lg border border-accent/20">
                <span className="font-semibold">Social</span>
              </div>
              <div className="px-6 py-3 bg-accent/10 rounded-lg border border-accent/20">
                <span className="font-semibold">Crypto</span>
              </div>
              <div className="px-6 py-3 bg-accent/10 rounded-lg border border-accent/20">
                <span className="font-semibold">Music</span>
              </div>
            </div>
            <p className="text-2xl font-bold mt-8">The biggest and best platform for music overall</p>
          </div>
        </div>
      ),
    },
    // Slide 4: Solution Today
    {
      title: 'Stream Star Today',
      content: (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500">✓</span>
                <span className="font-semibold">AI Song Generation</span>
              </div>
              <p className="text-sm text-muted-foreground">Full-length songs in seconds</p>
            </div>
            <div className="p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500">✓</span>
                <span className="font-semibold">AI Artist Creation</span>
              </div>
              <p className="text-sm text-muted-foreground">Artists evolve over time</p>
            </div>
            <div className="p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500">✓</span>
                <span className="font-semibold">Social Features</span>
              </div>
              <p className="text-sm text-muted-foreground">Comments, follows, chat</p>
            </div>
            <div className="p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500">✓</span>
                <span className="font-semibold">Collaboration</span>
              </div>
              <p className="text-sm text-muted-foreground">Fork, remix, extend songs</p>
            </div>
            <div className="p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500">✓</span>
                <span className="font-semibold">AI-Native Discovery</span>
              </div>
              <p className="text-sm text-muted-foreground">Not playlist-based</p>
            </div>
            <div className="p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500">✓</span>
                <span className="font-semibold">Blockchain Ready</span>
              </div>
              <p className="text-sm text-muted-foreground">Proof-ready ownership</p>
            </div>
          </div>
        </div>
      ),
    },
    // Slide 5: How It Works
    {
      title: 'How It Works',
      content: (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {[
              { step: '1', text: 'Create AI Artist' },
              { step: '2', text: 'Generate Songs' },
              { step: '3', text: 'Share & Discover' },
              { step: '4', text: 'Community Engages' },
              { step: '5', text: 'Monetize' },
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold mb-2">
                  {item.step}
                </div>
                <p className="text-sm text-center">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    // Slide 6: Differentiators
    {
      title: 'What Makes Us Different',
      content: (
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { title: 'Ownership First', desc: 'Users own their AI artists and songs' },
            { title: 'Social Native', desc: 'Built for community, not just consumption' },
            { title: 'Crypto Ready', desc: 'Blockchain integration from day one' },
            { title: 'GitHub for Music', desc: 'Collaboration through forking/remixing' },
            { title: 'AI-Native Discovery', desc: 'Not algorithm-driven playlists' },
            { title: 'Multi-Modal Future', desc: 'Music + videos + management tools' },
          ].map((item, idx) => (
            <div key={idx} className="p-4 bg-card rounded-lg border">
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      ),
    },
    // Slide 7: Roadmap
    {
      title: 'Roadmap',
      content: (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500">✓</span>
                <span className="font-semibold">Phase 1 (Current)</span>
              </div>
              <p className="text-sm text-muted-foreground">Core platform, AI generation, social features</p>
            </div>
            <div className="p-4 bg-card rounded-lg border border-accent/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-accent">→</span>
                <span className="font-semibold">Phase 2 (Next 6 months)</span>
              </div>
              <p className="text-sm text-muted-foreground">Tokenization, streaming revenue, music videos</p>
            </div>
            <div className="p-4 bg-card rounded-lg border border-accent/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-accent">→</span>
                <span className="font-semibold">Phase 3 (6-12 months)</span>
              </div>
              <p className="text-sm text-muted-foreground">Token launches, brand deals, management tools</p>
            </div>
            <div className="p-4 bg-card rounded-lg border border-accent/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-accent">→</span>
                <span className="font-semibold">Phase 4 (12-18 months)</span>
              </div>
              <p className="text-sm text-muted-foreground">Full creator economy platform, global expansion</p>
            </div>
          </div>
        </div>
      ),
    },
    // Slide 8: Business Model
    {
      title: 'Business Model & Monetization',
      content: (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { title: 'Platform Fees', desc: '5-10% of streaming revenue' },
              { title: 'Token Launches', desc: '2-5% fee on artist tokens' },
              { title: 'Brand Deals', desc: '10-20% commission' },
              { title: 'Premium Features', desc: 'Subscription for advanced tools' },
              { title: 'NFT/Blockchain', desc: 'Minting fees, marketplace commissions' },
            ].map((item, idx) => (
              <div key={idx} className="p-4 bg-card rounded-lg border">
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    // Slide 9: Traction
    {
      title: 'Traction & Metrics',
      content: (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 bg-card rounded-lg border text-center">
              <p className="text-3xl font-bold mb-2">[X]</p>
              <p className="text-sm text-muted-foreground">Users</p>
            </div>
            <div className="p-6 bg-card rounded-lg border text-center">
              <p className="text-3xl font-bold mb-2">[X]</p>
              <p className="text-sm text-muted-foreground">AI Artists</p>
            </div>
            <div className="p-6 bg-card rounded-lg border text-center">
              <p className="text-3xl font-bold mb-2">[X]</p>
              <p className="text-sm text-muted-foreground">Songs Generated</p>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Update these metrics with your actual numbers
          </p>
        </div>
      ),
    },
    // Slide 10: Market Opportunity
    {
      title: 'Market Opportunity',
      content: (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 bg-card rounded-lg border text-center">
              <p className="text-2xl font-bold mb-2">$76B</p>
              <p className="text-sm text-muted-foreground">TAM</p>
              <p className="text-xs text-muted-foreground mt-2">Music + Creator Economy</p>
            </div>
            <div className="p-6 bg-card rounded-lg border text-center">
              <p className="text-2xl font-bold mb-2">$1B+</p>
              <p className="text-sm text-muted-foreground">SAM</p>
              <p className="text-xs text-muted-foreground mt-2">AI Music Generation (30% YoY)</p>
            </div>
            <div className="p-6 bg-card rounded-lg border text-center">
              <p className="text-2xl font-bold mb-2">$760M</p>
              <p className="text-sm text-muted-foreground">SOM</p>
              <p className="text-xs text-muted-foreground mt-2">1% Market Share Target</p>
            </div>
          </div>
        </div>
      ),
    },
    // Slide 11: Competitive Landscape
    {
      title: 'Competitive Landscape',
      content: (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { category: 'AI Music', companies: 'Suno, Udio', weakness: 'No ownership/social' },
              { category: 'Streaming', companies: 'Spotify, Apple Music', weakness: 'Consumption only' },
              { category: 'Social', companies: 'TikTok, SoundCloud', weakness: 'No AI, limited monetization' },
              { category: 'Crypto', companies: 'Audius, Sound.xyz', weakness: 'Weak AI integration' },
            ].map((item, idx) => (
              <div key={idx} className="p-4 bg-card rounded-lg border">
                <h3 className="font-semibold mb-1">{item.category}</h3>
                <p className="text-sm mb-2">{item.companies}</p>
                <p className="text-xs text-muted-foreground">{item.weakness}</p>
              </div>
            ))}
          </div>
          <p className="text-center font-semibold mt-4">
            Our Advantage: Only platform combining all four pillars
          </p>
        </div>
      ),
    },
    // Slide 12: Team
    {
      title: 'Team',
      content: (
        <div className="space-y-6 text-center">
          <div className="p-6 bg-card rounded-lg border max-w-md mx-auto">
            <h3 className="text-xl font-semibold mb-2">Founder</h3>
            <p className="text-muted-foreground mb-4">[Your Name]</p>
            <p className="text-sm text-muted-foreground">
              [Your background, expertise, why this problem]
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Hiring plans: Engineers, Designers, BD
          </p>
        </div>
      ),
    },
    // Slide 13: The Ask
    {
      title: 'The Ask',
      content: (
        <div className="space-y-6">
          <div className="text-center mb-6">
            <p className="text-3xl font-bold mb-2">$250K - $500K</p>
            <p className="text-muted-foreground">Pre-Seed Round</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-4">Use of Funds</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Engineering</span>
                  <span className="text-sm font-semibold">40%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Product & Design</span>
                  <span className="text-sm font-semibold">30%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Marketing & Growth</span>
                  <span className="text-sm font-semibold">20%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Operations & Legal</span>
                  <span className="text-sm font-semibold">10%</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Milestones</h3>
              <div className="space-y-2 text-sm">
                <p>• Launch tokenization (3 months)</p>
                <p>• 10K users (6 months)</p>
                <p>• First brand deals (6 months)</p>
                <p>• Break-even (12 months)</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    // Slide 14: Vision Statement
    {
      title: 'Vision Statement',
      content: (
        <div className="space-y-6 text-center">
          <p className="text-2xl font-bold">
            Stream Star will be the platform where the next generation of music is created
          </p>
          <p className="text-xl text-muted-foreground">
            We&apos;re not building a feature - we&apos;re building the future of music
          </p>
          <p className="text-lg text-muted-foreground">
            Join us in revolutionizing how music is created, shared, and monetized
          </p>
        </div>
      ),
    },
    // Slide 15: Contact
    {
      title: 'Thank You',
      content: (
        <div className="space-y-6 text-center">
          <p className="text-2xl font-bold mb-4">Let&apos;s Build the Future of Music Together</p>
          <div className="space-y-2">
            <p className="text-lg">streamstar.xyz</p>
            <p className="text-muted-foreground">[Your Contact Email]</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        {/* Slide Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="min-h-[60vh] flex flex-col justify-center">
              {currentSlide === 0 ? (
                // Title slide
                <div className="text-center space-y-6">
                  <Logo variant="full" className="justify-center mb-8" />
                  <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
                    {slides[0].title}
                  </h1>
                  <p className="text-2xl md:text-3xl text-muted-foreground">
                    {slides[0].subtitle}
                  </p>
                  <p className="text-xl text-accent">
                    {slides[0].tagline}
                  </p>
                </div>
              ) : (
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold mb-8 text-center">
                    {slides[currentSlide].title}
                  </h2>
                  {slides[currentSlide].content}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="px-4 py-2 rounded-lg bg-card border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/10 transition-colors"
              >
                Previous
              </button>
              
              <div className="flex gap-2">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goToSlide(idx)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === currentSlide ? 'bg-accent' : 'bg-muted-foreground/30'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={nextSlide}
                disabled={currentSlide === slides.length - 1}
                className="px-4 py-2 rounded-lg bg-card border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/10 transition-colors"
              >
                Next
              </button>
            </div>
            <div className="text-center mt-2 text-sm text-muted-foreground">
              Slide {currentSlide + 1} of {slides.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvestorsPage() {
  return <InvestorsContent />;
}
