# SoundBed Design Specification
## Champagne & Amethyst Palette

---

## 1. Color Tokens

| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| `bg.primary` | 270 12% 5% | `#0c0a0e` | Main background |
| `bg.elevated` | 270 10% 8% | `#141117` | Elevated surfaces |
| `bg.card` | 270 8% 11% | `#1c1a1f` | Card backgrounds |
| `bg.subtle` | 270 7% 13% | `#211f24` | Subtle backgrounds |
| `bg.muted` | 270 7% 16% | `#2a272d` | Muted elements, tracks |
| `text.primary` | 45 30% 95% | `#f7f4ec` | Primary text |
| `text.muted` | 270 8% 60% | `#9e95a3` | Secondary text |
| `text.subtle` | 270 6% 42% | `#6e6872` | Helper text |
| `accent.primary` | 45 55% 70% | `#dfc58b` | Champagne - CTAs, highlights |
| `accent.secondary` | 275 45% 55% | `#9e59b8` | Amethyst - accents |
| `accent.rose` | 330 40% 60% | `#c77a99` | Rose quartz - harmony |
| `border.default` | 270 8% 18% | `#302c33` | Default borders |
| `border.subtle` | 270 6% 22% | `#3a363d` | Subtle borders |
| `success` | 160 45% 45% | `#3fa87a` | Success states |
| `warning` | 45 70% 55% | `#d9b635` | Warnings |
| `destructive` | 0 55% 50% | `#c73c3c` | Errors |

### Journey Colors
| Token | HSL | Hex |
|-------|-----|-----|
| `journey.calm` | 200 40% 50% | `#4d99b3` |
| `journey.deepRest` | 275 45% 50% | `#8f4db3` |
| `journey.creative` | 45 55% 65% | `#d9c478` |
| `journey.night` | 260 35% 45% | `#6b4d9e` |

---

## 2. Typography System

### Font Families
- **Primary (all UI):** Inter (Lovable UI targets)

### Type Scale

| Style | Size | Weight | Line Height | Font |
|-------|------|--------|-------------|------|
| Display | 48px / 3rem | 600 | 1.1 | Inter |
| Heading 1 | 30px / 1.875rem | 600 | 1.2 | Inter |
| Heading 2 | 24px / 1.5rem | 500 | 1.25 | Inter |
| Heading 3 | 20px / 1.25rem | 500 | 1.3 | Inter |
| Body Large | 18px / 1.125rem | 400 | 1.6 | Inter |
| Body | 16px / 1rem | 400 | 1.6 | Inter |
| Caption | 14px / 0.875rem | 400 | 1.5 | Inter |
| Small | 12px / 0.75rem | 400 | 1.4 | Inter |
| Label | 12px / 0.75rem | 500 | 1.4 | Inter (uppercase, tracking: 0.1em) |

---

## 3. Spacing & Layout

### Base Unit
8px grid system

### Common Spacing
| Element | Padding/Margin |
|---------|----------------|
| Page container | 32px horizontal |
| Card padding | 24px (standard), 48px (hero) |
| Section gap | 48px vertical |
| Card gap | 24px |
| Inner element gap | 16px |
| Tight spacing | 8px |

### Container
- Max width: 1152px (6xl)
- Centered with auto margins

---

## 4. Component Style Guidelines

### Card (Glass)
```
Background: linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))
Border: 1px solid hsl(275 20% 25% / 0.35)
Border Radius: 16px (rounded-2xl)
Shadow: 0 4px 20px hsl(270 20% 2% / 0.6)
Backdrop Filter: blur(20px)
Padding: 24px
```

### Card (Premium)
```
Background: linear-gradient(165deg, hsl(270 7% 15% / 0.6), hsl(270 10% 6% / 0.7))
Border: 1px solid hsl(275 15% 28% / 0.3)
Border Radius: 24px (rounded-3xl)
Shadow: 0 8px 40px hsl(270 20% 2% / 0.7)
Backdrop Filter: blur(30px)
```

### Primary Button
```
Background: linear-gradient(135deg, hsl(45 55% 70%), hsl(40 50% 62%))
Text Color: hsl(270 12% 8%) - dark on light
Border Radius: 12px (rounded-xl)
Padding: 16px 32px
Shadow: 0 4px 20px hsl(270 20% 2% / 0.6), 0 0 30px hsl(45 55% 70% / 0.2)
Hover: translateY(-2px), increased glow
```

### Secondary Button
```
Background: hsl(270 7% 14% / 0.8)
Border: 1px solid hsl(275 15% 28% / 0.4)
Text Color: hsl(45 30% 95%)
Border Radius: 12px
Padding: 12px 24px
Hover: lighter background, brighter border
```

### Ghost Button
```
Background: transparent
Text Color: hsl(270 8% 60%)
Border Radius: 12px
Padding: 8px 16px
Hover: hsl(270 7% 14% / 0.6) background
```

### Progress Bar
```
Track Background: hsl(270 7% 16%) - bg.muted
Fill: hsl(45 55% 70%) - accent.primary (champagne)
Height: 8px
Border Radius: 9999px (full)
```

### Metric Card
```
Background: hsl(270 10% 8% / 0.8)
Border: 1px solid hsl(270 10% 22% / 0.4)
Border Radius: 12px
Padding: 20px
```

### Journey Card
```
Background: linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))
Border: 1px solid hsl(275 15% 25% / 0.3)
Border Radius: 16px
Padding: 24px
Gradient Overlay: journey-specific color at 15% opacity
Hover: border brightens, translateY(-3px), overlay to 30%
```

---

## 5. Screen-by-Screen Breakdown

### Home (Dashboard)
**Components:**
- Header (greeting + avatar)
- Hero CTA Card (glass, centered)
- Navigation Bar (bottom)

**Layout:**
```
├── Ambient Background (fixed, pointer-events-none)
├── Container (max-w-6xl, px-8)
│   ├── Header
│   └── Hero Section
│       └── Glass Card (text-center, p-12)
│           ├── Icon Circle (w-24, glow)
│           ├── Heading
│           ├── Body Text
│           └── Primary Button
└── Navigation Bar (fixed bottom)
```

### Choose Journey
**Components:**
- Back Button + Title Header
- Journey Cards (2x2 grid)
- Info Card
- Navigation Bar

**Layout:**
```
├── Ambient Background
├── Container
│   ├── Header (flex, gap-4)
│   │   ├── Ghost Button (back)
│   │   └── Title Block
│   ├── Journey Grid (grid-cols-2, gap-6)
│   │   └── JourneyCard × 4
│   └── Info Card (glass)
└── Navigation Bar
```

### Session Summary
**Components:**
- Completion Header (icon + title)
- Metric Cards (grid)
- Coherence Graph
- Session Details Card
- Action Buttons (primary + secondary)
- Navigation Bar

**Layout:**
```
├── Ambient Background
├── Container
│   ├── Completion Header (text-center)
│   │   ├── Success Icon (w-20, glow)
│   │   ├── Title
│   │   └── Subtitle
│   ├── Metrics Grid (3 columns)
│   │   └── MetricCard × 3
│   ├── Graph Section
│   │   └── CoherenceGraph (glass card)
│   ├── Details Card (glass)
│   └── Button Group (flex, gap-4)
└── Navigation Bar
```

### User Profile
**Components:**
- Profile Header (avatar + name + stats)
- Progress Section (ring + metrics)
- Session History List
- Settings Link
- Navigation Bar

**Layout:**
```
├── Ambient Background
├── Container
│   ├── Profile Header
│   │   ├── Avatar (w-24, border)
│   │   ├── Name + Email
│   │   └── Quick Stats Row
│   ├── Progress Section (glass card)
│   │   ├── ProgressRing (centered)
│   │   └── Metrics Row
│   ├── History Section
│   │   ├── Section Title
│   │   └── SessionCard × n
│   └── Settings Button
└── Navigation Bar
```

### Active Session
**Components:**
- Minimal Header (back + timer)
- Status Row (3 indicators)
- Central Progress Ring (large)
- Waveform Visualization
- Pause/End Controls
- No Navigation Bar (immersive)

**Layout:**
```
├── Ambient Background (enhanced glow)
├── Container (flex-col, h-screen)
│   ├── Header (flex, justify-between)
│   │   ├── Back Button
│   │   └── Timer Display
│   ├── Status Row (3 columns, gap-4)
│   │   └── StatusIndicator × 3
│   ├── Center Section (flex-1, centered)
│   │   ├── ProgressRing (w-40, h-40)
│   │   └── State Label
│   ├── Waveform Section
│   │   └── WaveformVisualization
│   └── Controls (flex, gap-4)
│       ├── Secondary Button (Pause)
│       └── Ghost Button (End)
```

---

## 6. Effects & Animations

### Shadows
| Name | Value |
|------|-------|
| shadow-sm | 0 2px 8px hsl(270 20% 2% / 0.5) |
| shadow-md | 0 4px 20px hsl(270 20% 2% / 0.6) |
| shadow-lg | 0 8px 40px hsl(270 20% 2% / 0.7) |
| shadow-glow | 0 0 50px hsl(275 45% 55% / 0.15) |
| shadow-glow-accent | 0 0 50px hsl(45 55% 70% / 0.12) |

### Animations
| Name | Duration | Easing |
|------|----------|--------|
| fade-in-up | 500ms | cubic-bezier(0.4, 0, 0.2, 1) |
| float | 6s | ease-in-out, infinite |
| pulse-glow | 3s | ease-in-out, infinite |
| breathe | 4s | ease-in-out, infinite |

### Transitions
- Default: 200ms
- Cards: 300-400ms
- Hover transforms: translateY(-2px to -3px)

---

*This specification reflects the current Champagne & Amethyst implementation.*
