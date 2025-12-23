# Lyrics Experience Design Document

## Executive Summary

A premium, emotionally engaging lyrics experience that transforms raw song lyrics into a cinematic, dynamic viewing experience. Inspired by Apple Music's lyric presentation, iOS system animations, and premium creative tools.

---

## 1. Conceptual Design

### 1.1 Core Philosophy

**Clarity, Elegance, Restraint**

- Lyrics are **poetry in motion** — not static text, but living, breathing content that responds to user interaction and audio playback
- Every animation serves a purpose: enhancing readability, guiding attention, or creating emotional resonance
- Premium feel through **intentional motion**, not gratuitous effects
- **Progressive disclosure**: Show what's needed, when it's needed

### 1.2 User Emotion & Flow

**The Journey:**
1. **Discovery** → User sees lyrics exist (subtle indicator)
2. **Engagement** → User taps to reveal lyrics
3. **Immersion** → Lyrics unfold with cinematic entrance
4. **Connection** → Live highlighting syncs with audio (if playing)
5. **Sharing** → Beautiful, shareable lyric cards

**Emotional Goals:**
- **Wonder**: "These lyrics are beautiful"
- **Connection**: "I feel the music more deeply"
- **Delight**: "This feels premium and thoughtful"
- **Clarity**: "I can read and understand everything"

---

## 2. Display Modes

### 2.1 Immersive Mode (Default)
**When:** Full-screen or large modal overlay
**Purpose:** Deep reading, emotional connection

**Characteristics:**
- Large, readable typography (18-24px base)
- Generous line spacing (1.8-2.0)
- Centered alignment with subtle left/right padding
- Smooth scroll with momentum
- Dark background with subtle gradient (if album art available)
- Album art as blurred background (optional, subtle)

**Interactions:**
- Swipe down to dismiss (mobile)
- Pinch to zoom text size
- Tap to pause/play highlighting (if audio playing)

### 2.2 Minimal Mode
**When:** Inline on song page, below player
**Purpose:** Quick reference, non-intrusive

**Characteristics:**
- Compact typography (14-16px)
- Left-aligned, standard line spacing
- Collapsible section with smooth expand/collapse
- Subtle background (card or transparent)
- Max height with scroll

**Interactions:**
- Click to expand/collapse
- Scroll within container if expanded

### 2.3 Shareable Mode
**When:** User wants to share lyrics as image
**Purpose:** Social sharing, visual appeal

**Characteristics:**
- Beautiful typography with album art background
- Centered, poetic layout
- Song title, artist name, and lyrics
- High-resolution export (PNG/SVG)
- Multiple layout options (portrait, square, landscape)

**Interactions:**
- Generate share image button
- Copy image to clipboard
- Download as PNG

### 2.4 Live-Highlighted Mode
**When:** Audio is playing
**Purpose:** Karaoke-style synchronized highlighting

**Characteristics:**
- Current line highlighted with smooth transition
- Previous lines fade to muted
- Upcoming lines remain visible but dimmed
- Auto-scroll to keep current line centered (optional)
- Smooth color transitions (accent color for active)

**Interactions:**
- Toggle auto-scroll on/off
- Tap line to seek audio to that timestamp (if timestamped data available)

---

## 3. Technical Architecture

### 3.1 Data Model

**Lyrics Data Structure:**
```typescript
interface LyricsData {
  raw: string; // Plain text lyrics
  timestamped?: Array<{
    text: string;
    start: number; // seconds
    end: number; // seconds
  }>;
  version?: string; // Which conversion/version these lyrics belong to
}
```

**Storage Location:**
- `generation.output.metadata[conversion_{id}_lyrics]`
- Contains: `{ lyrics: string, lyrics_timestamped: unknown, subtype: string }`

### 3.2 Component Architecture

```
LyricsSection (Server Component)
  └── LyricsClient (Client Component)
       ├── LyricsViewer (Core display logic)
       │    ├── LyricsLine (Individual line component)
       │    └── LyricsControls (Mode switcher, share, etc.)
       └── LyricsSync (Audio synchronization hook)
```

### 3.3 Rendering Strategy

**Server-Side:**
- Fetch lyrics from generation metadata
- Parse and structure lyrics data
- Pass serialized data to client component

**Client-Side:**
- Handle all interactivity
- Manage display modes
- Sync with audio playback (if available)
- Handle animations and transitions

**Performance Optimizations:**
- Virtual scrolling for long lyrics (if >100 lines)
- Lazy load timestamped data only when needed
- Memoize parsed lyrics structure
- Debounce scroll events

---

## 4. Micro-Interactions & Animations

### 4.1 Motion Philosophy

**Apple-Inspired Principles:**
- **Ease-in-out** for most transitions (cubic-bezier(0.4, 0.0, 0.2, 1))
- **Spring animations** for playful interactions (cubic-bezier(0.34, 1.56, 0.64, 1))
- **Subtle scale** on hover/tap (1.02-1.05)
- **Fade transitions** for content changes (200-300ms)

### 4.2 Key Animations

#### Entrance Animation
- **Fade + Slide Up**: Lyrics fade in while sliding up 20px
- **Stagger**: Each line animates with 50ms delay
- **Duration**: 400ms total
- **Easing**: ease-out

#### Live Highlighting
- **Color Transition**: Smooth color change (300ms)
- **Scale Pulse**: Subtle scale (1.02) on line activation
- **Fade Previous**: Previous lines fade to 60% opacity (200ms)

#### Mode Switching
- **Cross-fade**: Old mode fades out, new mode fades in
- **Layout Transition**: Smooth height/width changes
- **Duration**: 300ms

#### Scroll Behavior
- **Momentum Scrolling**: Native iOS-style momentum
- **Smooth Scroll**: When jumping to timestamped line
- **Snap Points**: Optional snap to line centers

### 4.3 Timing Values

```typescript
const TIMINGS = {
  fast: 150,      // Quick feedback
  normal: 300,    // Standard transitions
  slow: 500,      // Emphasis animations
  stagger: 50,    // Line-by-line delay
};
```

---

## 5. UI/UX Excellence

### 5.1 Typography

**Font Stack:**
- Primary: System font stack (SF Pro on iOS, Segoe UI on Windows, etc.)
- Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

**Sizing:**
- Immersive: 20-24px base, 1.8 line-height
- Minimal: 14-16px base, 1.6 line-height
- Shareable: 18-22px base, 1.7 line-height

**Weight:**
- Body: 400 (Regular)
- Emphasis: 500 (Medium)
- Headers: 600 (Semibold)

### 5.2 Color & Contrast

**Text Colors:**
- Primary: `foreground` (high contrast)
- Muted: `muted-foreground` (60% opacity for inactive)
- Active: `accent` (for highlighted line)

**Backgrounds:**
- Immersive: Dark with subtle gradient
- Minimal: `card` or transparent
- Shareable: Album art with overlay

**Accessibility:**
- WCAG AA contrast ratios (4.5:1 minimum)
- Support for dark mode
- High contrast mode support

### 5.3 Spacing & Layout

**Padding:**
- Immersive: 24-32px horizontal, 40px vertical
- Minimal: 16-20px all around
- Shareable: 32-40px all around

**Line Spacing:**
- Generous vertical rhythm (1.6-2.0 line-height)
- Consistent paragraph spacing (1.5x line-height)

**Max Width:**
- Immersive: 680px (optimal reading width)
- Minimal: Full width of container
- Shareable: 1080px (for high-res export)

---

## 6. Accessibility & Readability

### 6.1 Accessibility Features

- **Screen Reader Support**: Proper ARIA labels, semantic HTML
- **Keyboard Navigation**: Tab through lines, Enter to expand/collapse
- **Focus Management**: Visible focus indicators
- **Reduced Motion**: Respect `prefers-reduced-motion`
- **High Contrast**: Support system high contrast mode

### 6.2 Readability Enhancements

- **Line Length**: Max 75 characters per line
- **Font Size Controls**: User-adjustable (if needed)
- **Dark Mode**: Automatic based on system preference
- **Line Breaks**: Preserve original formatting, smart wrapping
- **Paragraph Spacing**: Clear visual separation between verses/choruses

### 6.3 Internationalization

- **RTL Support**: Right-to-left languages (Arabic, Hebrew)
- **Character Encoding**: UTF-8, proper emoji rendering
- **Font Fallbacks**: Appropriate fonts for different scripts

---

## 7. Implementation Guidance

### 7.1 Technology Stack

**Core:**
- React 18+ (Server & Client Components)
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS

**Animation Libraries:**
- **Framer Motion** (recommended): Declarative animations, gesture support
- **React Spring** (alternative): Physics-based animations
- **CSS Transitions** (fallback): For simple animations

**Audio Sync:**
- Custom hook using `useEffect` + `requestAnimationFrame`
- Audio element ref or Web Audio API

### 7.2 Component Structure

```typescript
// Server Component (app/songs/[id]/page.tsx)
export default async function SongPage({ params }) {
  const lyrics = await getLyricsForSong(songId);
  return <LyricsSection lyrics={lyrics} />;
}

// Client Component (components/lyrics/LyricsSection.tsx)
'use client';
export function LyricsSection({ lyrics }: Props) {
  const [mode, setMode] = useState<DisplayMode>('minimal');
  const { isPlaying, currentTime } = useAudioPlayer(); // If available
  
  return (
    <LyricsViewer
      lyrics={lyrics}
      mode={mode}
      currentTime={currentTime}
      isPlaying={isPlaying}
    />
  );
}
```

### 7.3 Key Hooks

**useLyricsSync:**
```typescript
function useLyricsSync(
  timestampedLyrics: TimestampedLine[],
  currentTime: number,
  isPlaying: boolean
) {
  // Returns: { activeLineIndex, scrollToLine }
}
```

**useLyricsMode:**
```typescript
function useLyricsMode() {
  // Returns: { mode, setMode, toggleMode }
}
```

### 7.4 Performance Considerations

- **Virtual Scrolling**: Use `react-window` or `react-virtualized` for 100+ lines
- **Memoization**: Memoize parsed lyrics structure
- **Lazy Loading**: Load timestamped data only when needed
- **Debouncing**: Debounce scroll and resize events
- **Code Splitting**: Lazy load lyrics components

---

## 8. Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Parse lyrics from generation metadata
- [ ] Basic minimal mode (inline, collapsible)
- [ ] Simple text rendering with proper typography
- [ ] Expand/collapse interaction

### Phase 2: Enhanced Display
- [ ] Immersive mode (full-screen/modal)
- [ ] Smooth entrance animations
- [ ] Mode switching
- [ ] Basic shareable mode (text only)

### Phase 3: Live Sync
- [ ] Audio synchronization hook
- [ ] Live highlighting (if timestamped data available)
- [ ] Auto-scroll to active line
- [ ] Tap-to-seek functionality

### Phase 4: Polish & Share
- [ ] Beautiful shareable images with album art
- [ ] Multiple layout options
- [ ] Export functionality
- [ ] Accessibility enhancements

### Phase 5: Advanced Features
- [ ] Virtual scrolling for long lyrics
- [ ] Text size controls
- [ ] RTL support
- [ ] Analytics tracking

---

## 9. Design Principles Checklist

✅ **Clarity**: Text is readable, hierarchy is clear
✅ **Elegance**: Animations are smooth, purposeful
✅ **Restraint**: No gimmicks, every effect serves a purpose
✅ **Premium**: Feels intentional, high-quality
✅ **Modern**: Uses contemporary patterns and technologies
✅ **Accessible**: Works for all users
✅ **Performant**: Smooth on all devices
✅ **Emotional**: Creates connection, not just displays text

---

## 10. Success Metrics

- **Engagement**: % of users who view lyrics
- **Time Spent**: Average time viewing lyrics
- **Shares**: Number of lyric shares
- **Accessibility**: Screen reader compatibility score
- **Performance**: Time to interactive, scroll FPS
- **User Feedback**: Qualitative feedback on experience

---

## Appendix: Reference Inspirations

- **Apple Music**: Clean, centered lyrics with smooth highlighting
- **Spotify**: Minimal inline lyrics, shareable lyric cards
- **Genius**: Annotated lyrics with community insights
- **iOS System UI**: Smooth animations, gesture support
- **Premium Creative Tools**: Intentional motion, clarity

---

*This document is a living design guide. Update as implementation progresses and user feedback is gathered.*

