# Logo Setup Instructions

## Logo File Placement

Place your `streamstar` logo file in the `public` directory with the following naming:

### Required Files:
1. **`/public/logo.svg`** - Main logo (SVG format recommended for crisp rendering)
   - Used in: Header navigation, footer, loading states
   - Should be optimized and scalable

2. **`/public/og-image.png`** - Open Graph image for social sharing
   - Dimensions: 1200x630px
   - Used when sharing links on social media (Twitter, Facebook, LinkedIn, etc.)
   - Should include your logo and branding

3. **`/public/favicon.ico`** - Browser favicon
   - 16x16, 32x32, 48x48 sizes
   - Used in browser tabs

4. **`/public/icon-16x16.png`** - 16x16 PNG icon
5. **`/public/icon-32x32.png`** - 32x32 PNG icon
6. **`/public/icon-192x192.png`** - 192x192 PNG icon (PWA)
7. **`/public/icon-512x512.png`** - 512x512 PNG icon (PWA)
8. **`/public/apple-touch-icon.png`** - 180x180 PNG icon (iOS)

## Logo Integration Points

The logo is integrated in the following locations:

1. **Header Navigation** (`components/navigation/Nav.tsx`)
   - Left side of navigation bar
   - Links to home page
   - Responsive sizing

2. **Footer** (`components/layout/Footer.tsx`)
   - Brand section with logo and tagline

3. **Social Sharing** (`app/layout.tsx`)
   - Open Graph meta tags
   - Twitter Card meta tags
   - Used when links are shared

4. **Favicon** (`app/icon.tsx`)
   - Browser tab icon
   - Generated dynamically (can be replaced with static file)

5. **Open Graph Image** (`app/opengraph-image.tsx`)
   - Social media preview image
   - Generated dynamically (can be replaced with static file)

## Logo Component Usage

The logo is available as reusable components:

```tsx
import { Logo } from '@/components/branding/Logo';
import { LogoIcon } from '@/components/branding/LogoIcon';

// Full logo with text
<Logo variant="default" showText={true} />

// Compact version
<Logo variant="compact" />

// Icon only
<LogoIcon size={24} />
```

## Apple-Style Design Principles Applied

1. **Clarity**: Logo is crisp and recognizable at all sizes
2. **Deference**: Logo doesn't overwhelm content, positioned thoughtfully
3. **Depth**: Subtle hover effects and transitions
4. **Consistency**: Same logo used throughout the application
5. **Quality**: High-resolution assets for all use cases

## Next Steps

1. Export your logo as SVG and PNG formats
2. Place files in the `public` directory
3. Optimize images for web (use tools like ImageOptim or Squoosh)
4. Test social sharing previews using:
   - [Twitter Card Validator](https://cards-dev.twitter.com/validator)
   - [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   - [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)

## File Structure

```
public/
├── logo.svg              # Main logo (SVG)
├── favicon.ico           # Browser favicon
├── icon-16x16.png        # Small icon
├── icon-32x32.png        # Medium icon
├── icon-192x192.png      # PWA icon
├── icon-512x512.png      # PWA icon (large)
├── apple-touch-icon.png  # iOS icon
├── og-image.png          # Social sharing image (1200x630)
└── site.webmanifest      # PWA manifest (already created)
```


