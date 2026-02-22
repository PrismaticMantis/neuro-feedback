# SoundBed Implementation Specification
## Pixel-Perfect React/Vite Implementation Guide
---
## Design Tokens
```css
:root {
  /* ============================================
     CORE PALETTE - Deep Purple-Black Base
     ============================================ */
  
  /* Backgrounds */
  --background: 270 12% 5%;                    /* #0c0a0e - Primary background */
  --background-elevated: 270 10% 8%;           /* #141117 - Elevated surfaces */
  --background-card: 270 8% 11%;               /* #1c1a1f - Card backgrounds */
  --background-card-hover: 270 9% 14%;         /* #252228 - Card hover state */
  --background-subtle: 270 7% 13%;             /* #211f24 - Subtle backgrounds */
  
  /* Foreground/Text */
  --foreground: 45 30% 95%;                    /* #f8f6f0 - Primary text */
  --foreground-muted: 270 8% 60%;              /* #9a939f - Secondary text */
  --foreground-subtle: 270 6% 42%;             /* #6e6972 - Tertiary text */
  
  /* Primary Accent - Champagne Gold */
  --primary: 45 55% 70%;                       /* #dfc58b - Primary accent */
  --primary-foreground: 270 12% 8%;            /* #151218 - Text on primary */
  --primary-glow: 50 60% 78%;                  /* #e8d9a5 - Glow variant */
  --primary-muted: 45 35% 50%;                 /* #a99a65 - Muted primary */
  
  /* Secondary Accent - Amethyst Purple */
  --secondary: 275 45% 55%;                    /* #9e59b8 - Secondary accent */
  --secondary-foreground: 45 30% 95%;          /* #f8f6f0 - Text on secondary */
  --secondary-muted: 275 30% 40%;              /* #7a4d8c - Muted secondary */
  
  /* Accent - Rose Quartz */
  --accent: 330 40% 60%;                       /* #c77a9a - Tertiary accent */
  --accent-foreground: 45 30% 95%;             /* #f8f6f0 */
  
  /* Journey Colors - Semantic */
  --journey-calm: 200 40% 50%;                 /* #4d99b3 - Blue-teal */
  --journey-deep-rest: 275 45% 50%;            /* #8c4da6 - Deep purple */
  --journey-creative: 45 55% 65%;              /* #d4b86e - Warm gold */
  --journey-night: 260 35% 45%;                /* #6b5a8c - Dusty purple */
  
  /* Semantic Colors */
  --success: 160 45% 45%;                      /* #3fa87a - Green */
  --warning: 45 70% 55%;                       /* #d4a836 - Amber */
  --destructive: 0 55% 50%;                    /* #c74040 - Red */
  
  /* UI Elements */
  --border: 270 8% 18%;                        /* #302c33 */
  --border-subtle: 270 6% 22%;                 /* #3a363d */
  --input: 270 7% 14%;                         /* #252226 */
  --muted: 270 7% 16%;                         /* #292629 */
  
  /* Border Radius */
  --radius: 1rem;                              /* 16px base */
  
  /* ============================================
     GRADIENTS
     ============================================ */
  --gradient-primary: linear-gradient(135deg, hsl(45 55% 70%), hsl(40 50% 62%));
  --gradient-accent: linear-gradient(135deg, hsl(275 45% 55%), hsl(290 40% 50%));
  --gradient-calm: linear-gradient(135deg, hsl(200 40% 45%), hsl(195 35% 40%));
  --gradient-deep-rest: linear-gradient(135deg, hsl(275 45% 50%), hsl(285 40% 45%));
  --gradient-creative: linear-gradient(135deg, hsl(45 55% 65%), hsl(50 50% 58%));
  --gradient-night: linear-gradient(135deg, hsl(260 35% 40%), hsl(270 30% 35%));
  
  /* ============================================
     SHADOWS
     ============================================ */
  --shadow-sm: 0 2px 8px hsl(270 20% 2% / 0.5);
  --shadow-md: 0 4px 20px hsl(270 20% 2% / 0.6);
  --shadow-lg: 0 8px 40px hsl(270 20% 2% / 0.7);
  --shadow-glow: 0 0 50px hsl(275 45% 55% / 0.15);
  --shadow-glow-accent: 0 0 50px hsl(45 55% 70% / 0.12);
}
```
---
## Typography Specification
```css
/* Font Imports */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
html {
  font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  letter-spacing: -0.01em;
}
/* Display - Hero titles */
.text-display {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 48px;           /* 3rem */
  font-weight: 600;
  letter-spacing: -0.025em;  /* tracking-tight */
  line-height: 1.1;
}
/* Heading 1 - Page titles */
.text-heading-1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 30px;           /* 1.875rem */
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.2;
}
/* Heading 2 - Section titles */
.text-heading-2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 24px;           /* 1.5rem */
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.3;
}
/* Heading 3 - Card titles */
.text-heading-3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 20px;           /* 1.25rem */
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.4;
}
/* Body Large */
.text-body-large {
  font-family: 'Inter', sans-serif;
  font-size: 18px;           /* 1.125rem */
  font-weight: 400;
  line-height: 1.625;        /* leading-relaxed */
}
/* Body - Default text */
.text-body {
  font-family: 'Inter', sans-serif;
  font-size: 16px;           /* 1rem */
  font-weight: 400;
  line-height: 1.625;
}
/* Caption - Secondary text */
.text-caption {
  font-family: 'Inter', sans-serif;
  font-size: 14px;           /* 0.875rem */
  font-weight: 400;
  color: hsl(270 8% 60%);    /* foreground-muted */
}
/* Small - Tertiary text */
.text-small {
  font-family: 'Inter', sans-serif;
  font-size: 12px;           /* 0.75rem */
  font-weight: 400;
  color: hsl(270 6% 42%);    /* foreground-subtle */
}
/* Label - Uppercase tracking */
.text-label {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;     /* tracking-widest */
  color: hsl(270 6% 42%);
}
```
---
## Screen: Home / Start Session
### Layout Specification
```
Container:
  max-width: 72rem (1152px)
  padding-x: 32px
  padding-bottom: 96px (for nav bar clearance)
Header:
  padding-y: 24px
  display: flex
  justify-content: space-between
  align-items: center
```
### Hero Card Component
```css
.hero-card {
  /* Layout */
  padding: 48px;
  text-align: center;
  position: relative;
  overflow: hidden;
  
  /* Background */
  background: linear-gradient(165deg, 
    hsl(270 7% 14% / 0.7), 
    hsl(270 10% 8% / 0.8)
  );
  
  /* Border */
  border: 1px solid hsl(275 20% 25% / 0.35);
  border-radius: 16px;
  
  /* Shadow */
  box-shadow: 
    0 4px 20px hsl(270 20% 2% / 0.6),
    inset 0 1px 0 hsl(275 15% 35% / 0.08);
  
  /* Effects */
  backdrop-filter: blur(20px);
}
/* Ambient glow orb inside hero */
.hero-ambient-orb {
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: hsl(45 55% 70% / 0.1);    /* primary/10 */
  filter: blur(48px);                    /* blur-3xl */
  animation: pulse-glow 3s ease-in-out infinite;
}
/* Icon container */
.hero-icon-container {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: hsl(45 55% 70% / 0.1);    /* primary/10 */
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 32px;
  box-shadow: 0 0 50px hsl(45 55% 70% / 0.2);  /* glow-primary */
}
/* Sparkles icon inside */
.hero-icon {
  width: 48px;
  height: 48px;
  color: hsl(45 55% 70%);  /* primary */
}
```
### Primary Button
```css
.btn-primary {
  /* Layout */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 48px;
  
  /* Typography */
  font-family: 'Space Grotesk', sans-serif;
  font-size: 18px;
  font-weight: 500;
  
  /* Background - Champagne gradient */
  background: linear-gradient(135deg, hsl(45 55% 70%), hsl(40 50% 62%));
  color: hsl(270 12% 8%);  /* dark text */
  
  /* Border */
  border: none;
  border-radius: 12px;
  
  /* Shadow */
  box-shadow: 
    0 4px 20px hsl(270 20% 2% / 0.6),
    0 0 30px hsl(45 55% 70% / 0.2);
  
  /* Transition */
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 
    0 8px 40px hsl(270 20% 2% / 0.7),
    0 0 50px hsl(45 55% 70% / 0.3);
}
.btn-primary:active {
  transform: translateY(0);
}
```
### Navigation Bar
```css
.nav-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  
  /* Background */
  background: hsl(270 10% 8% / 0.9);  /* background-elevated/90 */
  backdrop-filter: blur(24px);        /* blur-xl */
  
  /* Border */
  border-top: 1px solid hsl(270 6% 22%);  /* border-subtle */
}
.nav-bar-inner {
  max-width: 896px;   /* max-w-4xl */
  margin: 0 auto;
  padding: 0 24px;
}
.nav-bar-items {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 12px 0;
}
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 24px;
  border-radius: 12px;
  transition: all 200ms;
}
.nav-item-icon {
  width: 24px;
  height: 24px;
}
.nav-item-label {
  font-size: 12px;
  font-weight: 500;
}
.nav-item--active {
  color: hsl(45 55% 70%);  /* primary */
}
.nav-item--inactive {
  color: hsl(270 8% 60%);  /* foreground-muted */
}
.nav-item--inactive:hover {
  color: hsl(45 30% 95%);  /* foreground */
}
/* Active indicator dot */
.nav-active-dot {
  position: absolute;
  bottom: 4px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: hsl(45 55% 70%);
}
```
---
## Screen: Choose Journey
### Layout Specification
```
Container:
  max-width: 72rem (1152px)
  padding-x: 32px
  padding-bottom: 96px
Header:
  display: flex
  align-items: center
  gap: 16px
  padding-y: 24px
Journey Grid:
  margin-top: 32px
  display: grid
  grid-template-columns: repeat(2, 1fr)  /* md:grid-cols-2 */
  gap: 24px
  
  @media (max-width: 768px):
    grid-template-columns: 1fr
```
### Journey Card Component
```css
.journey-card {
  /* Layout */
  position: relative;
  overflow: hidden;
  padding: 24px;
  width: 100%;
  text-align: left;
  
  /* Background */
  background: linear-gradient(165deg, 
    hsl(270 7% 14% / 0.7), 
    hsl(270 10% 8% / 0.8)
  );
  
  /* Border */
  border: 1px solid hsl(275 15% 25% / 0.3);
  border-radius: 16px;
  
  /* Transition */
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
/* Overlay tint - varies by journey type */
.journey-card::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.15;
  transition: opacity 400ms;
  /* background set via variant class */
}
.journey-card:hover {
  border-color: hsl(275 30% 40% / 0.4);
  transform: translateY(-3px);
}
.journey-card:hover::before {
  opacity: 0.3;
}
/* Journey Variants - Overlay gradients */
.journey-calm::before {
  background: linear-gradient(135deg, hsl(200 40% 45%), hsl(195 35% 40%));
}
.journey-deep-rest::before {
  background: linear-gradient(135deg, hsl(275 45% 50%), hsl(285 40% 45%));
}
.journey-creative::before {
  background: linear-gradient(135deg, hsl(45 55% 65%), hsl(50 50% 58%));
}
.journey-night::before {
  background: linear-gradient(135deg, hsl(260 35% 40%), hsl(270 30% 35%));
}
/* Icon Container - Journey specific colors */
.journey-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  transition: transform 300ms;
}
.journey-card:hover .journey-icon {
  transform: scale(1.1);
}
.journey-icon--calm { background: hsl(200 40% 50%); }
.journey-icon--deep-rest { background: hsl(275 45% 50%); }
.journey-icon--creative { background: hsl(45 55% 65%); }
.journey-icon--night { background: hsl(260 35% 45%); }
.journey-icon svg {
  width: 24px;
  height: 24px;
  color: hsl(270 12% 8%);  /* primary-foreground (dark) */
}
/* Play button */
.journey-play-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: hsl(270 9% 14%);  /* background-card-hover */
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 300ms;
}
.journey-card:hover .journey-play-btn {
  background: hsl(45 55% 70%);  /* primary */
  transform: scale(1.1);
}
.journey-play-btn svg {
  width: 16px;
  height: 16px;
  margin-left: 2px;  /* visual centering for play icon */
  color: hsl(270 8% 60%);
}
.journey-card:hover .journey-play-btn svg {
  color: hsl(270 12% 8%);  /* primary-foreground */
}
/* Duration badge */
.journey-duration {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: hsl(270 8% 60%);
}
.journey-duration svg {
  width: 16px;
  height: 16px;
  color: hsl(270 6% 42%);
}
```
---
## Screen: Session Setup
### Layout Specification
```
Container:
  max-width: 72rem (1152px)
  padding-x: 32px
  padding-bottom: 96px
Two-Column Grid (Desktop):
  margin-top: 24px
  display: grid
  grid-template-columns: repeat(2, 1fr)  /* lg:grid-cols-2 */
  gap: 24px
  
  @media (max-width: 1024px):
    grid-template-columns: 1fr
Column Spacing:
  display: flex
  flex-direction: column
  gap: 24px
```
### Device Connection Card
```css
.device-card {
  /* Uses .card-glass base */
  padding: 24px;
}
/* Connection Status Item */
.connection-status {
  display: flex;
  align-items: center;
  gap: 32px;
  margin-bottom: 24px;
}
.connection-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.connection-icon--connected {
  background: hsl(275 45% 55% / 0.2);  /* secondary/20 */
}
.connection-icon--disconnected {
  background: hsl(270 6% 42% / 0.2);   /* foreground-subtle/20 */
}
.connection-icon svg {
  width: 20px;
  height: 20px;
}
.connection-icon--connected svg {
  color: hsl(275 45% 55%);  /* secondary */
}
.connection-icon--disconnected svg {
  color: hsl(270 8% 60%);   /* foreground-muted */
}
/* Status dot - pulsing when connected */
.status-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: hsl(160 45% 45%);  /* success */
  animation: pulse 2s infinite;
}
/* Divider */
.connection-divider {
  width: 1px;
  height: 40px;
  background: hsl(270 6% 22%);  /* border-subtle */
}
```
### Electrode Contact Card
```css
.electrode-card {
  /* Uses .card-glass base */
  padding: 24px;
}
/* Status chip */
.electrode-status-chip {
  padding: 4px 12px;
  border-radius: 9999px;  /* rounded-full */
  font-size: 12px;
  font-weight: 500;
}
.electrode-status-chip--good {
  background: hsl(275 45% 55% / 0.1);
  color: hsl(275 45% 55%);
  border: 1px solid hsl(275 45% 55% / 0.3);
}
.electrode-status-chip--partial {
  background: hsl(45 70% 55% / 0.1);
  color: hsl(45 70% 55%);
  border: 1px solid hsl(45 70% 55% / 0.3);
}
/* Electrode indicators */
.electrode-grid {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin-bottom: 24px;
}
.electrode-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}
.electrode-dot--good {
  background: hsl(160 45% 45%);  /* success */
  box-shadow: 0 0 8px hsl(160 45% 45% / 0.5);
}
.electrode-dot--poor {
  background: hsl(0 55% 50%);  /* destructive */
}
.electrode-label {
  font-size: 12px;
  color: hsl(270 8% 60%);
  margin-top: 8px;
}
/* Battery indicator */
.battery-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: hsl(270 7% 13%);  /* background-subtle */
}
.battery-row svg {
  width: 20px;
  height: 20px;
  color: hsl(45 70% 55%);  /* warning */
}
```
### Slider Component
```css
/* Progress/Slider Track */
.slider-track {
  height: 8px;
  border-radius: 4px;
  background: hsl(270 7% 16%);  /* muted */
}
.slider-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, hsl(45 55% 70%), hsl(40 50% 62%));
}
.slider-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: hsl(45 55% 70%);
  box-shadow: 0 2px 8px hsl(270 20% 2% / 0.5);
  cursor: grab;
}
```
---
## Screen: Active Session
### Layout Specification
```
Container:
  max-width: 80rem (1280px)  /* max-w-7xl */
  padding-x: 24px (mobile) / 40px (desktop)
  padding-y: 24px
  min-height: 100vh
  display: flex
  flex-direction: column
Header:
  display: flex
  justify-content: space-between
  align-items: center
  margin-bottom: 32px
Top Section (Two Cards):
  display: flex
  gap: 16px
  margin-bottom: 16px
  
Journey Card:
  margin-bottom: 16px
  
Center Timer:
  display: flex
  flex-direction: column
  align-items: center
  margin-bottom: 16px
Bottom Graph:
  flex: 1
  min-height: 160px
```
### Header (Active Session)
```css
.active-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}
.muse-logo {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 24px;
  font-weight: 300;
  letter-spacing: 0.05em;
  text-transform: lowercase;
  color: hsl(45 30% 95%);
}
.battery-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 9999px;
  background: hsl(270 7% 13% / 0.5);
}
.battery-badge svg {
  width: 16px;
  height: 16px;
  color: hsl(45 70% 55%);  /* amber-400 equivalent */
}
.battery-badge span {
  font-size: 12px;
  color: hsl(270 8% 60%);
}
```
### Electrode + Brainwave Combined Card
```css
.status-card {
  /* Uses .card-glass base */
  padding: 16px;
  flex: 1;
}
/* Electrode indicators (Active Session - smaller) */
.electrode-dot-sm {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transition: all 300ms;
}
.electrode-dot-sm--good {
  background: hsl(160 45% 45%);
  box-shadow: 0 0 12px hsl(160 45% 45% / 0.6);
}
.electrode-dot-sm--warning {
  background: hsl(45 95% 55%);  /* amber-400 */
  box-shadow: 0 0 12px hsl(45 95% 55% / 0.5);
}
/* Brainwave bands */
.brainwave-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding-top: 12px;
  border-top: 1px solid hsl(270 6% 22% / 0.5);
}
.brainwave-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.brainwave-symbol {
  font-size: 18px;
  font-weight: 300;
  color: hsl(270 8% 60%);
}
.brainwave-bar {
  width: 40px;
  height: 2px;
  border-radius: 1px;
}
/* Brainwave gradient colors */
.brainwave-bar--delta { background: linear-gradient(90deg, #6366f1, #818cf8); }
.brainwave-bar--theta { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
.brainwave-bar--alpha { background: linear-gradient(90deg, hsl(45 55% 70%), #22d3ee); }
.brainwave-bar--beta { background: linear-gradient(90deg, #f59e0b, #fb923c); }
.brainwave-bar--gamma { background: linear-gradient(90deg, #f43f5e, #ec4899); }
.brainwave-value {
  font-size: 12px;
  font-weight: 500;
  color: hsl(45 30% 95%);
}
```
### Mental State Card
```css
.mental-state-card {
  /* Uses .card-glass base */
  padding: 16px;
  flex: 1;
}
.mental-state-grid {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 8px;
  height: calc(100% - 32px);  /* Account for header */
}
.mental-state-item {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  text-align: center;
  border: 1px solid transparent;
  transition: all 400ms;
}
.mental-state-item--coherence.active {
  background: hsl(45 55% 70% / 0.2);
  border-color: hsl(45 55% 70% / 0.4);
}
.mental-state-item--settling.active {
  background: hsl(45 70% 55% / 0.2);
  border-color: hsl(45 70% 55% / 0.4);
}
.mental-state-item--active.active {
  background: hsl(0 75% 55% / 0.2);
  border-color: hsl(0 75% 55% / 0.4);
}
.mental-state-icon {
  width: 20px;
  height: 20px;
  margin: 0 auto 6px;
}
.mental-state-icon--coherence.active { color: hsl(45 55% 70%); }
.mental-state-icon--settling.active { color: hsl(45 95% 65%); }
.mental-state-icon--active.active { color: hsl(0 75% 65%); }
.mental-state-label {
  font-size: 12px;
  font-weight: 500;
}
```
### Progress Ring (Timer)
```css
.progress-ring-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.progress-ring {
  transform: rotate(-90deg);
}
.progress-ring-bg {
  fill: none;
  stroke: hsl(270 8% 18%);  /* border */
  stroke-width: 5px;
}
.progress-ring-fill {
  fill: none;
  stroke: url(#progressGradient);
  stroke-width: 5px;
  stroke-linecap: round;
  transition: stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1);
}
/* Gradient definition for progress ring */
/*
<linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="hsl(45 55% 70%)" />
  <stop offset="100%" stop-color="hsl(50 60% 78%)" />
</linearGradient>
*/
/* Timer size: 160px */
.timer-ring {
  width: 160px;
  height: 160px;
}
.timer-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.timer-value {
  font-family: 'Space Grotesk', monospace;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: hsl(45 30% 95%);
}
.timer-label {
  font-size: 12px;
  color: hsl(270 8% 60%);
  margin-top: 4px;
}
/* Time remaining below ring */
.time-remaining {
  margin-top: 12px;
  text-align: center;
}
.time-remaining-label {
  font-size: 12px;
  color: hsl(270 8% 60%);
}
.time-remaining-value {
  font-family: monospace;
  font-size: 16px;
  font-weight: 500;
  color: hsl(45 55% 70%);
}
```
### Waveform Graph
```css
.waveform-card {
  /* Uses .card-premium base */
  padding: 20px;
  min-height: 160px;
  display: flex;
  flex-direction: column;
}
.waveform-container {
  position: relative;
  flex: 1;
  min-height: 110px;
  border-radius: 16px;
  overflow: hidden;
  
  /* Background gradient for zones */
  background: linear-gradient(180deg, 
    hsl(275 45% 55% / 0.06) 0%,
    hsl(270 10% 12% / 0.04) 50%,
    hsl(270 10% 8% / 0.9) 100%
  );
  
  border: 1px solid hsl(275 40% 45% / 0.12);
}
/* Zone backgrounds */
.zone-top {    /* Gold/Coherence */
  flex: 1;
  background: linear-gradient(180deg, 
    hsl(45 55% 70% / 0.1), 
    hsl(45 55% 70% / 0.04)
  );
}
.zone-middle { /* Neutral/Settling */
  flex: 1;
  background: linear-gradient(180deg, 
    hsl(270 6% 42% / 0.03), 
    hsl(270 6% 42% / 0.02)
  );
}
.zone-bottom { /* Red/Active Mind */
  flex: 1;
  background: linear-gradient(180deg, 
    hsl(0 75% 55% / 0.04), 
    hsl(0 75% 55% / 0.08)
  );
}
/* Zone divider lines */
.zone-divider-gold {
  position: absolute;
  top: 33.33%;
  width: 100%;
  height: 1px;
  background: hsl(45 55% 70% / 0.15);
}
.zone-divider-neutral {
  position: absolute;
  top: 66.66%;
  width: 100%;
  height: 1px;
  background: hsl(270 6% 42% / 0.1);
}
/* Waveform SVG */
.waveform-line {
  fill: none;
  stroke: url(#waveGradient);
  stroke-width: 0.4;
  stroke-linecap: round;
}
.waveform-glow {
  fill: none;
  stroke: hsl(45 55% 70% / 0.1);
  stroke-width: 1.5;
  stroke-linecap: round;
  filter: blur(2px);
}
/*
<linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="hsl(275 45% 55% / 0.4)" />
  <stop offset="50%" stop-color="hsl(45 55% 70%)" />
  <stop offset="100%" stop-color="hsl(50 60% 78%)" />
</linearGradient>
*/
/* Time axis */
.waveform-time-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding: 0 4px;
}
.waveform-time-label {
  font-family: monospace;
  font-size: 12px;
  color: hsl(270 6% 42%);
}
```
### Bottom Controls
```css
.session-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
}
/* End Session button - uses .btn-primary with modifications */
.btn-end-session {
  padding: 12px 40px;
  border-radius: 9999px;  /* rounded-full for active session */
}
/* Audio toggle button */
.btn-audio-toggle {
  /* Uses .card-glass base */
  padding: 12px;
  border-radius: 9999px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 300ms;
}
.btn-audio-toggle.enabled {
  border-color: hsl(45 55% 70% / 0.3);
  box-shadow: 0 0 50px hsl(45 55% 70% / 0.2);
}
.btn-audio-toggle svg {
  width: 20px;
  height: 20px;
}
.btn-audio-toggle.enabled svg {
  color: hsl(45 55% 70%);
}
.btn-audio-toggle.disabled svg {
  color: hsl(270 8% 60%);
}
```
---
## Screen: Session Summary
### Layout Specification
```
Container:
  max-width: 72rem (1152px)
  padding-x: 32px
  padding-bottom: 96px
Completion Hero:
  margin-top: 16px
  text-align: center
Metrics Grid:
  margin-top: 32px
  display: grid
  grid-template-columns: repeat(4, 1fr)  /* md:grid-cols-4 */
  gap: 16px
  
  @media (max-width: 768px):
    grid-template-columns: repeat(2, 1fr)
Coherence Timeline:
  margin-top: 40px
  
Body Rhythm:
  margin-top: 40px
  display: grid
  grid-template-columns: repeat(3, 1fr)  /* md:grid-cols-3 */
  gap: 16px
  
  @media (max-width: 768px):
    grid-template-columns: 1fr
Action Buttons:
  margin-top: 40px
  margin-bottom: 32px
  display: flex
  justify-content: center
  gap: 16px
```
### Completion Hero
```css
.completion-hero {
  /* Uses .card-glass base */
  padding: 40px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.completion-glow {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.completion-orb {
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: hsl(45 55% 70% / 0.1);
  filter: blur(48px);
  animation: pulse-glow 3s ease-in-out infinite;
}
/* Coherence Ring - 200px for summary */
.coherence-ring {
  width: 200px;
  height: 200px;
  stroke-width: 10px;
}
.coherence-value {
  font-size: 48px;
  font-weight: 600;
  color: hsl(45 30% 95%);
}
.coherence-label {
  font-size: 14px;
  color: hsl(270 8% 60%);
  margin-top: 4px;
}
```
### Metric Card
```css
.metric-card {
  padding: 20px;
  border-radius: 12px;
  background: hsl(270 10% 8% / 0.8);
  border: 1px solid hsl(270 10% 22% / 0.4);
}
.metric-label {
  font-size: 14px;
  color: hsl(270 8% 60%);
  margin-bottom: 8px;
}
.metric-value {
  font-size: 30px;        /* text-3xl for md size */
  font-weight: 600;
  color: hsl(45 30% 95%);
  letter-spacing: -0.025em;
}
.metric-unit {
  font-size: 16px;
  font-weight: 400;
  color: hsl(270 8% 60%);
  margin-left: 6px;
}
/* Size variants */
.metric-card--sm { padding: 16px; }
.metric-card--sm .metric-value { font-size: 24px; }
.metric-card--lg { padding: 24px; }
.metric-card--lg .metric-value { font-size: 36px; }
/* Trend indicator */
.metric-trend {
  font-size: 14px;
  margin-left: 8px;
}
.metric-trend--up { color: hsl(160 45% 45%); }
.metric-trend--down { color: hsl(0 55% 50%); }
```
### Coherence Graph (Summary)
```css
.coherence-graph {
  position: relative;
  width: 100%;
  height: 180px;  /* specified height */
}
/* Grid lines */
.graph-grid {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
}
.graph-grid-line {
  border-top: 1px solid hsl(270 6% 22% / 0.5);
}
/* Y-axis labels */
.graph-y-axis {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transform: translateX(-100%);
  padding-right: 12px;
  font-size: 12px;
  color: hsl(270 6% 42%);
}
/* Time labels */
.graph-x-axis {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  transform: translateY(100%);
  padding-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: hsl(270 6% 42%);
}
/* Graph line */
.graph-line {
  fill: none;
  stroke: url(#coherenceGradient);
  stroke-width: 0.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* Area fill under line */
.graph-area {
  fill: url(#areaGradient);
}
/*
<linearGradient id="coherenceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="hsl(275 45% 55%)" />
  <stop offset="50%" stop-color="hsl(45 55% 70%)" />
  <stop offset="100%" stop-color="hsl(275 45% 55%)" />
</linearGradient>
<linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
  <stop offset="0%" stop-color="hsl(45 55% 70%)" stop-opacity="0.3" />
  <stop offset="100%" stop-color="hsl(45 55% 70%)" stop-opacity="0" />
</linearGradient>
*/
```
### Body Rhythm Cards
```css
.rhythm-card {
  /* Uses .card-glass base */
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.rhythm-icon-container {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: hsl(275 45% 55% / 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rhythm-icon {
  width: 24px;
  height: 24px;
  color: hsl(275 45% 55%);
}
.rhythm-label {
  font-size: 14px;
  color: hsl(270 8% 60%);
}
.rhythm-value {
  font-size: 20px;
  font-weight: 500;
  color: hsl(45 30% 95%);
}
.rhythm-unit {
  font-size: 16px;
  font-weight: 400;
  color: hsl(270 8% 60%);
  margin-left: 4px;
}
```
### Secondary Button
```css
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  
  font-family: 'Space Grotesk', sans-serif;
  font-size: 16px;
  font-weight: 500;
  
  background: hsl(270 7% 14% / 0.8);
  color: hsl(45 30% 95%);
  
  border: 1px solid hsl(275 15% 28% / 0.4);
  border-radius: 12px;
  
  transition: all 200ms;
  cursor: pointer;
}
.btn-secondary:hover {
  background: hsl(270 7% 17% / 0.9);
  border-color: hsl(275 20% 35% / 0.5);
}
/* Large variant for action buttons */
.btn-secondary--lg {
  padding: 16px 32px;
}
```
---
## Screen: Profile
### Layout Specification
```
Container:
  max-width: 72rem (1152px)
  padding-x: 32px
  padding-bottom: 96px
Profile Card:
  Uses .card-glass
  padding: 24px
  display: flex
  align-items: center
  gap: 24px
Stats Grid:
  margin-top: 32px
  display: grid
  grid-template-columns: repeat(2, 1fr)
  gap: 16px
Session History:
  margin-top: 40px
  
Session List:
  display: flex
  flex-direction: column
  gap: 12px
```
### Profile Card
```css
.profile-card {
  /* Uses .card-glass base */
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 24px;
}
.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: hsl(45 55% 70% / 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 50px hsl(45 55% 70% / 0.2);
}
.profile-avatar svg {
  width: 40px;
  height: 40px;
  color: hsl(45 55% 70%);
}
.profile-name {
  font-size: 24px;
  font-weight: 500;
  color: hsl(45 30% 95%);
}
.profile-meta {
  font-size: 14px;
  color: hsl(270 8% 60%);
  margin-top: 4px;
}
```
### Stats Cards
```css
.stat-card {
  /* Uses .card-glass base */
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat-icon-container {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: hsl(275 45% 55% / 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.stat-icon {
  width: 24px;
  height: 24px;
  color: hsl(275 45% 55%);
}
.stat-label {
  font-size: 14px;
  color: hsl(270 8% 60%);
}
.stat-value {
  font-size: 20px;
  font-weight: 500;
  color: hsl(45 30% 95%);
}
```
### Session Card (History List)
```css
.session-card {
  /* Uses .card-glass-hover base */
  width: 100%;
  padding: 20px;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 20px;
}
.session-indicator {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
/* Journey-specific indicator colors */
.session-indicator--calm {
  background: hsl(200 40% 50% / 0.2);
  border: 1px solid hsl(200 40% 50% / 0.3);
}
.session-indicator--calm .dot { background: hsl(200 40% 50%); }
.session-indicator--deep-rest {
  background: hsl(275 45% 50% / 0.2);
  border: 1px solid hsl(275 45% 50% / 0.3);
}
.session-indicator--deep-rest .dot { background: hsl(275 45% 50%); }
.session-indicator--creative {
  background: hsl(45 55% 65% / 0.2);
  border: 1px solid hsl(45 55% 65% / 0.3);
}
.session-indicator--creative .dot { background: hsl(45 55% 65%); }
.session-indicator--night {
  background: hsl(260 35% 45% / 0.2);
  border: 1px solid hsl(260 35% 45% / 0.3);
}
.session-indicator--night .dot { background: hsl(260 35% 45%); }
.session-indicator .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.session-content {
  flex: 1;
  min-width: 0;
}
.session-name {
  font-size: 16px;
  font-weight: 500;
  color: hsl(45 30% 95%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-date {
  font-size: 14px;
  color: hsl(270 8% 60%);
}
.session-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-shrink: 0;
}
.session-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: hsl(270 8% 60%);
}
.session-stat svg {
  width: 16px;
  height: 16px;
  color: hsl(270 6% 42%);
}
.session-score {
  font-size: 16px;
  font-weight: 500;
  color: hsl(45 30% 95%);
}
.session-score-icon {
  color: hsl(275 45% 55%);
}
```
---
## Animations
```css
/* Fade in from bottom */
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in-up {
  animation: fade-in-up 500ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
  opacity: 0;  /* Initial state before animation */
}
/* Staggered delays */
.delay-100 { animation-delay: 100ms; }
.delay-150 { animation-delay: 150ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
.delay-400 { animation-delay: 400ms; }
/* Pulse glow for ambient elements */
@keyframes pulse-glow {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
.animate-pulse-glow {
  animation: pulse-glow 3s ease-in-out infinite;
}
/* Float animation */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
.animate-float {
  animation: float 6s ease-in-out infinite;
}
/* Breathing animation for ambient bg */
@keyframes breathe {
  0%, 100% { 
    transform: scale(1); 
    opacity: 0.8; 
  }
  50% { 
    transform: scale(1.02); 
    opacity: 1; 
  }
}
.animate-breathe {
  animation: breathe 4s ease-in-out infinite;
}
/* Shimmer for loading states */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.animate-shimmer {
  background: linear-gradient(90deg, transparent, hsl(45 55% 70% / 0.1), transparent);
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}
```
---
## Icon SVG Paths
### Sparkles Icon (Lucide)
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  <path d="M5 3v4"/>
  <path d="M19 17v4"/>
  <path d="M3 5h4"/>
  <path d="M17 19h4"/>
</svg>
```
### Play Icon
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="5 3 19 12 5 21 5 3"/>
</svg>
```
### Waves Icon (Calm)
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
  <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
  <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
</svg>
```
### Moon Icon (Deep Rest)
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
</svg>
```
### Wind Icon (Night Wind-Down)
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>
  <path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>
  <path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>
</svg>
```
### Home Icon
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  <polyline points="9 22 9 12 15 12 15 22"/>
</svg>
```
### Compass Icon (Journeys)
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
</svg>
```
### User Icon (Profile)
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
  <circle cx="12" cy="7" r="4"/>
</svg>
```
---
## Ambient Background
```css
/* Page body background */
body {
  background: 
    radial-gradient(ellipse 100% 100% at 50% -20%, hsl(275 20% 12%) 0%, transparent 50%),
    linear-gradient(180deg, hsl(270 12% 5%) 0%, hsl(270 15% 3%) 100%);
  min-height: 100vh;
}
/* Ambient glow overlay */
.ambient-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: 
    radial-gradient(ellipse 80% 60% at 50% -10%, hsl(275 45% 55% / 0.05), transparent),
    radial-gradient(ellipse 50% 40% at 90% 80%, hsl(45 55% 70% / 0.03), transparent),
    radial-gradient(ellipse 40% 30% at 10% 60%, hsl(330 40% 60% / 0.02), transparent);
}
```
---
## Breakpoints
```css
/* Mobile First */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
/* Container max-widths */
.max-w-4xl { max-width: 896px; }   /* Navigation bar */
.max-w-6xl { max-width: 1152px; }  /* Most pages */
.max-w-7xl { max-width: 1280px; }  /* Active Session */
