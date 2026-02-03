// Design Showcase Component
// Displays all design tokens, typography, and component examples from the SoundBed Design Specification

import { useState } from 'react';
import { motion } from 'framer-motion';

const COLORS = {
  bg: {
    primary: { hsl: '270 12% 5%', hex: '#0c0a0e', name: 'bg.primary' },
    elevated: { hsl: '270 10% 8%', hex: '#141117', name: 'bg.elevated' },
    card: { hsl: '270 8% 11%', hex: '#1c1a1f', name: 'bg.card' },
    subtle: { hsl: '270 7% 13%', hex: '#211f24', name: 'bg.subtle' },
    muted: { hsl: '270 7% 16%', hex: '#2a272d', name: 'bg.muted' },
  },
  text: {
    primary: { hsl: '45 30% 95%', hex: '#f7f4ec', name: 'text.primary' },
    muted: { hsl: '270 8% 60%', hex: '#9e95a3', name: 'text.muted' },
    subtle: { hsl: '270 6% 42%', hex: '#6e6872', name: 'text.subtle' },
  },
  accent: {
    primary: { hsl: '45 55% 70%', hex: '#dfc58b', name: 'accent.primary (Champagne)' },
    secondary: { hsl: '275 45% 55%', hex: '#9e59b8', name: 'accent.secondary (Amethyst)' },
    rose: { hsl: '330 40% 60%', hex: '#c77a99', name: 'accent.rose' },
  },
  journey: {
    calm: { hsl: '200 40% 50%', hex: '#4d99b3', name: 'journey.calm' },
    deepRest: { hsl: '275 45% 50%', hex: '#8f4db3', name: 'journey.deepRest' },
    creative: { hsl: '45 55% 65%', hex: '#d9c478', name: 'journey.creative' },
    night: { hsl: '260 35% 45%', hex: '#6b4d9e', name: 'journey.night' },
  },
  semantic: {
    success: { hsl: '160 45% 45%', hex: '#3fa87a', name: 'success' },
    warning: { hsl: '45 70% 55%', hex: '#d9b635', name: 'warning' },
    destructive: { hsl: '0 55% 50%', hex: '#c73c3c', name: 'destructive' },
  },
};

const TYPOGRAPHY = [
  { style: 'Display', size: '48px / 3rem', weight: 600, font: 'Inter' },
  { style: 'Heading 1', size: '30px / 1.875rem', weight: 600, font: 'Inter' },
  { style: 'Heading 2', size: '24px / 1.5rem', weight: 500, font: 'Inter' },
  { style: 'Heading 3', size: '20px / 1.25rem', weight: 500, font: 'Inter' },
  { style: 'Body Large', size: '18px / 1.125rem', weight: 400, font: 'Inter' },
  { style: 'Body', size: '16px / 1rem', weight: 400, font: 'Inter' },
  { style: 'Caption', size: '14px / 0.875rem', weight: 400, font: 'Inter' },
  { style: 'Small', size: '12px / 0.75rem', weight: 400, font: 'Inter' },
  { style: 'Label', size: '12px / 0.75rem', weight: 500, font: 'Inter (uppercase)' },
];

export function DesignShowcase() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'hsl(270 12% 5%)', 
      color: '#f7f4ec',
      padding: '48px 32px',
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{ maxWidth: '1152px', margin: '0 auto' }}>
        <h1 style={{ 
          fontSize: '48px', 
          fontWeight: 600, 
          fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          marginBottom: '8px',
        }}>
          SoundBed Design Showcase
        </h1>
        <p style={{ fontSize: '18px', color: '#9e95a3', marginBottom: '48px' }}>
          Champagne & Amethyst Palette
        </p>

        {/* Color Tokens */}
        <section style={{ marginBottom: '64px' }}>
          <h2 style={{ fontSize: '30px', fontWeight: 600, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '32px' }}>
            Color Tokens
          </h2>
          
          {Object.entries(COLORS).map(([category, colors]) => (
            <div key={category} style={{ marginBottom: '40px' }}>
              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: 500, 
                fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                textTransform: 'capitalize',
                marginBottom: '20px',
                color: '#dfc58b',
              }}>
                {category}
              </h3>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '16px',
              }}>
                {Object.entries(colors).map(([key, color]) => (
                  <motion.div
                    key={key}
                    whileHover={{ scale: 1.02 }}
                    style={{
                      background: `linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))`,
                      border: '1px solid hsl(275 20% 25% / 0.35)',
                      borderRadius: '16px',
                      padding: '20px',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                    onClick={() => copyToClipboard(color.hex, `${category}-${key}`)}
                  >
                    <div style={{
                      width: '100%',
                      height: '60px',
                      background: `hsl(${color.hsl})`,
                      borderRadius: '8px',
                      marginBottom: '12px',
                      border: '1px solid hsl(275 15% 25% / 0.3)',
                    }} />
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                      {color.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9e95a3', fontFamily: 'monospace' }}>
                      {color.hex}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6e6872', marginTop: '4px' }}>
                      hsl({color.hsl})
                    </div>
                    {copied === `${category}-${key}` && (
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: '#3fa87a',
                        color: '#0c0a0e',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 500,
                      }}>
                        Copied!
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Typography */}
        <section style={{ marginBottom: '64px' }}>
          <h2 style={{ fontSize: '30px', fontWeight: 600, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '32px' }}>
            Typography System
          </h2>
          <div style={{
            background: 'linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))',
            border: '1px solid hsl(275 20% 25% / 0.35)',
            borderRadius: '16px',
            padding: '32px',
            backdropFilter: 'blur(20px)',
          }}>
            {TYPOGRAPHY.map((type) => (
              <div key={type.style} style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid hsl(270 8% 18% / 0.3)' }}>
                <div style={{ 
                  fontSize: type.size.split(' / ')[0],
                  fontWeight: type.weight,
                  fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                  textTransform: type.style === 'Label' ? 'uppercase' : 'none',
                  letterSpacing: type.style === 'Label' ? '0.1em' : 'normal',
                  marginBottom: '8px',
                }}>
                  {type.style}: The quick brown fox jumps over the lazy dog
                </div>
                <div style={{ fontSize: '12px', color: '#9e95a3', fontFamily: 'monospace' }}>
                  {type.size} · Weight {type.weight} · {type.font}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Component Examples */}
        <section style={{ marginBottom: '64px' }}>
          <h2 style={{ fontSize: '30px', fontWeight: 600, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '32px' }}>
            Component Examples
          </h2>

          {/* Buttons */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 500, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '20px', color: '#dfc58b' }}>
              Buttons
            </h3>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: 'linear-gradient(135deg, hsl(45 55% 70%), hsl(40 50% 62%))',
                  color: 'hsl(270 12% 8%)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '16px 32px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px hsl(270 20% 2% / 0.6), 0 0 30px hsl(45 55% 70% / 0.2)',
                }}
              >
                Primary Button
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: 'hsl(270 7% 14% / 0.8)',
                  border: '1px solid hsl(275 15% 28% / 0.4)',
                  color: 'hsl(45 30% 95%)',
                  borderRadius: '12px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Secondary Button
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'hsl(270 8% 60%)',
                  borderRadius: '12px',
                  padding: '8px 16px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Ghost Button
              </motion.button>
            </div>
          </div>

          {/* Cards */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 500, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '20px', color: '#dfc58b' }}>
              Cards
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              <div style={{
                background: 'linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))',
                border: '1px solid hsl(275 20% 25% / 0.35)',
                borderRadius: '16px',
                padding: '24px',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 4px 20px hsl(270 20% 2% / 0.6)',
              }}>
                <h4 style={{ fontSize: '20px', fontWeight: 500, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '12px' }}>
                  Glass Card
                </h4>
                <p style={{ fontSize: '16px', color: '#9e95a3', lineHeight: 1.6 }}>
                  Standard glass card with backdrop blur and subtle gradient.
                </p>
              </div>
              <div style={{
                background: 'linear-gradient(165deg, hsl(270 7% 15% / 0.6), hsl(270 10% 6% / 0.7))',
                border: '1px solid hsl(275 15% 28% / 0.3)',
                borderRadius: '24px',
                padding: '32px',
                backdropFilter: 'blur(30px)',
                boxShadow: '0 8px 40px hsl(270 20% 2% / 0.7)',
              }}>
                <h4 style={{ fontSize: '20px', fontWeight: 500, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '12px' }}>
                  Premium Card
                </h4>
                <p style={{ fontSize: '16px', color: '#9e95a3', lineHeight: 1.6 }}>
                  Enhanced premium card with deeper blur and larger radius.
                </p>
              </div>
              <div style={{
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: '12px',
                padding: '20px',
              }}>
                <h4 style={{ fontSize: '20px', fontWeight: 500, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '12px' }}>
                  Metric Card
                </h4>
                <div style={{ fontSize: '32px', fontWeight: 600, color: '#dfc58b', marginBottom: '4px' }}>
                  87%
                </div>
                <div style={{ fontSize: '14px', color: '#9e95a3' }}>
                  Coherence
                </div>
              </div>
            </div>
          </div>

          {/* Journey Cards */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 500, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '20px', color: '#dfc58b' }}>
              Journey Cards
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {Object.entries(COLORS.journey).map(([key, color]) => (
                <motion.div
                  key={key}
                  whileHover={{ y: -3, scale: 1.02 }}
                  style={{
                    background: `linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))`,
                    border: `1px solid hsl(275 15% 25% / 0.3)`,
                    borderRadius: '16px',
                    padding: '24px',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(135deg, hsl(${color.hsl} / 0.15), transparent)`,
                    pointerEvents: 'none',
                  }} />
                  <div style={{ fontSize: '18px', fontWeight: 600, color: `hsl(${color.hsl})`, marginBottom: '8px', position: 'relative' }}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </div>
                  <div style={{ fontSize: '14px', color: '#9e95a3', position: 'relative' }}>
                    Journey description text
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 500, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '20px', color: '#dfc58b' }}>
              Progress Bar
            </h3>
            <div style={{
              background: 'hsl(270 7% 16%)',
              borderRadius: '9999px',
              height: '8px',
              overflow: 'hidden',
              maxWidth: '400px',
            }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '75%' }}
                transition={{ duration: 1, ease: 'easeOut' }}
                style={{
                  background: 'hsl(45 55% 70%)',
                  height: '100%',
                  borderRadius: '9999px',
                }}
              />
            </div>
          </div>
        </section>

        {/* Spacing Examples */}
        <section style={{ marginBottom: '64px' }}>
          <h2 style={{ fontSize: '30px', fontWeight: 600, fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: '32px' }}>
            Spacing System (8px grid)
          </h2>
          <div style={{
            background: 'linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))',
            border: '1px solid hsl(275 20% 25% / 0.35)',
            borderRadius: '16px',
            padding: '32px',
          }}>
            {[8, 16, 24, 32, 48].map((size) => (
              <div key={size} style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '60px', fontSize: '14px', color: '#9e95a3', fontFamily: 'monospace' }}>
                  {size}px
                </div>
                <div style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  background: '#dfc58b',
                  borderRadius: '4px',
                }} />
                <div style={{ fontSize: '14px', color: '#9e95a3' }}>
                  {size / 8}x base unit
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
