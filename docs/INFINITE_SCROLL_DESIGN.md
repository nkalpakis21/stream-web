# Infinite Scroll Design Document

## Architecture Design (Staff Engineer Perspective)

### 1. Pagination Strategy

**Cursor-Based Pagination with Firestore**
- Use Firestore's `startAfter()` for efficient, consistent pagination
- Store last document snapshot as cursor for next page
- Prevents issues with offset-based pagination (duplicates, skipped items)

**Why Cursor-Based?**
- ✅ Consistent results even as data changes
- ✅ Efficient (no need to skip documents)
- ✅ Works well with real-time data
- ✅ Scales to millions of documents

### 2. API Design

**Server-Side API Route: `/api/discover/songs`**
- Accepts: `limit`, `cursor` (last document ID), `query` (search term)
- Returns: `{ songs, nextCursor, hasMore }`
- Handles pagination logic server-side
- Serializes Firestore Timestamps

**Benefits:**
- Centralized pagination logic
- Better error handling
- Can add caching layer later
- Easier to test and maintain

### 3. State Management

**React Hook Pattern:**
```typescript
const {
  songs,
  loading,
  loadingMore,
  hasMore,
  error,
  loadMore,
  reset
} = useInfiniteSongs(query);
```

**State Structure:**
- `songs`: Accumulated array of all loaded songs
- `loading`: Initial load state
- `loadingMore`: Pagination load state
- `hasMore`: Whether more songs are available
- `cursor`: Last document ID for pagination
- `error`: Error state with retry capability

### 4. Performance Optimizations

**Scroll Detection:**
- Use Intersection Observer API (more efficient than scroll events)
- Observe a sentinel element at bottom of list
- Prefetch when user is 200px from bottom

**Data Fetching:**
- Debounce rapid scroll events
- Batch artist name fetching
- Cache pagination cursors
- Prevent duplicate requests (request deduplication)

**Rendering:**
- Use React.memo for SongCard components
- Virtual scrolling for very long lists (future enhancement)
- Lazy load images (already handled by Next.js Image)

### 5. Error Handling

**Graceful Degradation:**
- Show error state with retry button
- Maintain existing songs on error
- Log errors for monitoring
- Fallback to manual "Load More" button if infinite scroll fails

**Race Condition Prevention:**
- Use request IDs to ignore stale responses
- Cancel in-flight requests on query change
- Prevent multiple simultaneous loads

---

## UX Design (Staff UI/UX Designer Perspective)

### 1. Loading States

**Initial Load:**
- Full-page skeleton grid matching final layout
- Smooth fade-in when content loads
- No layout shifts

**Pagination Load:**
- Subtle loading indicator at bottom (spinner + text)
- Skeleton cards for new items (3-4 cards)
- Smooth fade-in animation for new content
- Maintain scroll position

**Loading Indicator Design:**
```
┌─────────────────────────┐
│  [spinner] Loading more │
└─────────────────────────┘
```
- Centered, subtle, non-intrusive
- Uses accent color
- Small, elegant spinner

### 2. Scroll Behavior

**Natural Scrolling:**
- Smooth, native browser scrolling
- No artificial delays
- Load trigger: 200px before bottom (prefetch)
- Maintain momentum during load

**Scroll Position:**
- Preserve position during pagination
- No jumps or resets
- Smooth transitions

### 3. Visual Feedback

**New Content Animation:**
- Fade-in: 300ms ease-out
- Stagger: 50ms delay per card
- Scale: subtle 1.02 → 1.0 scale

**End of Results:**
- Clear, friendly message
- Subtle divider line
- "You've reached the end" text
- Option to go back to top

**Error States:**
- Inline error message
- Retry button (prominent, accessible)
- Maintains existing content
- Clear, actionable error text

### 4. Performance Perception

**Optimistic Rendering:**
- Show skeleton immediately
- Update UI as data arrives
- No blank states during pagination

**Progressive Enhancement:**
- Works without JavaScript (shows initial page)
- Enhances with infinite scroll if JS available
- Graceful fallback to "Load More" button

**No Layout Shifts:**
- Fixed card dimensions
- Skeleton matches final layout
- Smooth transitions

### 5. Accessibility

**Keyboard Navigation:**
- Tab through all cards
- Focus management during loads
- Screen reader announcements for new content

**Screen Reader Support:**
- Announce "Loading more songs"
- Announce "X new songs loaded"
- Announce "End of results"

**Reduced Motion:**
- Respect `prefers-reduced-motion`
- Disable animations if requested
- Still functional without animations

---

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create API route `/api/discover/songs`
2. Update discovery service with cursor pagination
3. Create `useInfiniteSongs` hook

### Phase 2: Infinite Scroll Component
1. Implement Intersection Observer
2. Add loading states
3. Handle edge cases

### Phase 3: Polish & UX
1. Add skeleton loaders
2. Implement animations
3. Add error handling
4. Accessibility enhancements

### Phase 4: Optimization
1. Request deduplication
2. Caching layer
3. Performance monitoring

---

## Technical Specifications

### API Route: `/api/discover/songs`

**Request:**
```typescript
GET /api/discover/songs?limit=20&cursor=<lastDocId>&query=<searchTerm>
```

**Response:**
```typescript
{
  songs: SongDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

### Hook: `useInfiniteSongs`

**Interface:**
```typescript
function useInfiniteSongs(query?: string): {
  songs: SongDocument[];
  artistNames: Map<string, string>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  reset: () => void;
}
```

### Intersection Observer Config

```typescript
{
  root: null, // viewport
  rootMargin: '200px', // trigger 200px before bottom
  threshold: 0.1
}
```

---

## Success Metrics

- **Performance**: < 100ms to detect scroll, < 500ms to load next page
- **UX**: Smooth scrolling, no layout shifts, clear loading states
- **Reliability**: 99.9% successful pagination loads
- **Accessibility**: WCAG AA compliant

---

*This design prioritizes clarity, performance, and user delight—core Apple design principles.*

