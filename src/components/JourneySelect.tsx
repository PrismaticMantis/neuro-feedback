// UI reference: design/targets/2 - Choose Journey.png
// Lovable design tokens applied: icon circles, card backgrounds, play buttons, spacing

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getJourneys, setLastJourneyId } from '../lib/session-storage';
import type { User } from '../types';

const ENABLED_JOURNEY_ID = 'creativeFlow';

/* Journey display tokens from Lovable spec (duration + icon color + card background)
 * Target 2 - Choose Journey.png reference:
 * - Calm: Blue icon (#4d99b3), grey card
 * - Deep Rest: Purple icon (#a67bc8), purple-tinted card
 * - Creative Flow: Gold icon (#d9c478), grey card
 * - Night Wind-Down: Purple icon (#a67bc8), purple-tinted card
 */
const JOURNEY_DISPLAY: Record<string, { 
  duration: string; 
  iconColor: string;
  iconBg: string; // Background for icon circle
  cardBg: 'grey' | 'purple';
}> = {
  calm: { duration: '15 min', iconColor: '#ffffff', iconBg: '#5B8DEF', cardBg: 'grey' },
  deepRest: { duration: '25 min', iconColor: '#ffffff', iconBg: '#9B6BC8', cardBg: 'purple' },
  creativeFlow: { duration: '20 min', iconColor: '#0c0a0e', iconBg: '#D9C478', cardBg: 'grey' },
  nightWindDown: { duration: '30 min', iconColor: '#ffffff', iconBg: '#9B6BC8', cardBg: 'purple' },
};

/* Journey icons matching Lovable Target 2 - Choose Journey.png */
function JourneyIcon({ id }: { id: string }) {
  if (id === 'calm') {
    // Three horizontal wavy lines (matches target)
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
        <path d="M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
        <path d="M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
      </svg>
    );
  }
  if (id === 'deepRest') {
    // Crescent moon (matches target)
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    );
  }
  if (id === 'creativeFlow') {
    // Four-point sparkle/star (matches target)
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
        <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" />
      </svg>
    );
  }
  if (id === 'nightWindDown') {
    // Three horizontal lines with adjustment marks (matches target filter icon)
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="8" x2="20" y2="8"/>
        <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
        <line x1="4" y1="16" x2="20" y2="16"/>
        <circle cx="16" cy="16" r="2" fill="currentColor" stroke="none"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
  );
}

interface JourneySelectProps {
  currentUser: User | null;
}

export function JourneySelect({ currentUser }: JourneySelectProps) {
  const navigate = useNavigate();
  const [comingSoonId, setComingSoonId] = useState<string | null>(null);
  const journeys = getJourneys();

  const handleSelect = (journeyId: string) => {
    if (journeyId !== ENABLED_JOURNEY_ID) {
      setComingSoonId(journeyId);
      setTimeout(() => setComingSoonId(null), 2000);
      return;
    }
    if (currentUser) setLastJourneyId(currentUser.id, journeyId);
    navigate('/setup');
  };

  return (
    <motion.div
      className="screen screen-journeys"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      style={{
        padding: '0 24px 100px', // Lovable Target 2: padding with room for bottom nav
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      {/* Header - Target 2: Back arrow + Title block */}
      <header 
        className="journey-select-header"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '24px 0 28px',
        }}
      >
        <Link 
          to="/home" 
          className="btn-ghost" 
          aria-label="Back"
          style={{
            padding: '8px',
            borderRadius: '8px',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s ease',
            marginTop: '4px', // Align with title baseline
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </Link>
        <div 
          className="journey-select-title-block"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {/* Title - Target 2: "Choose Journey" bold white */}
          <h1 
            className="journey-select-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '24px',
              fontWeight: 600,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Choose Journey
          </h1>
          {/* Subtitle - Target 2: "Select your path to clarity" muted */}
          <p 
            className="journey-select-subtitle"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Select your path to clarity
          </p>
        </div>
      </header>

      {comingSoonId && (
        <div 
          className="journey-coming-soon-toast" 
          role="status"
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: 'calc(var(--space-tight) + 4px) var(--space-card-gap)',
            background: 'var(--bg-card-glass)',
            border: 'var(--border-card-glass)',
            borderRadius: 'var(--radius-card-glass)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--font-caption-size)',
            fontWeight: 'var(--weight-regular)',
            color: 'var(--text-muted)',
            zIndex: 100,
            boxShadow: 'var(--shadow-card-glass)',
            animation: 'fade-in-up var(--animation-fade-in-up-duration) var(--animation-fade-in-up-easing)',
          }}
        >
          Coming soon
        </div>
      )}
      {/* Journey Grid - Target 2: 2x2 grid with 24px gap */}
      <div 
        className="journey-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px', // Lovable target shows tighter gap
          marginBottom: '32px',
        }}
      >
        {journeys.map((j) => {
          const display = JOURNEY_DISPLAY[j.id] ?? { duration: '15 min', iconColor: '#ffffff', iconBg: '#9e59b8', cardBg: 'grey' };
          const isPurpleCard = display.cardBg === 'purple';
          const isEnabled = j.id === ENABLED_JOURNEY_ID;
          
          return (
            <motion.button
              key={j.id}
              type="button"
              className={`journey-card journey-card-${display.cardBg}`}
              onClick={() => handleSelect(j.id)}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textAlign: 'left',
                padding: '20px',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden',
                // Card backgrounds from Lovable Target 2
                background: isPurpleCard 
                  ? 'linear-gradient(165deg, hsl(275 12% 14% / 0.85), hsl(275 15% 9% / 0.9))'
                  : 'linear-gradient(165deg, hsl(270 7% 13% / 0.75), hsl(270 10% 9% / 0.85))',
                border: isPurpleCard
                  ? '1px solid hsl(275 20% 28% / 0.4)'
                  : '1px solid hsl(270 15% 22% / 0.35)',
                boxShadow: '0 4px 20px hsl(270 20% 2% / 0.5)',
                minHeight: '180px',
              }}
            >
              {/* Icon Circle - Lovable Target 2: 44px colored circle with glow */}
              <motion.div 
                className="journey-card-icon" 
                style={{ 
                  background: display.iconBg, 
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  flexShrink: 0,
                  color: display.iconColor,
                  boxShadow: `0 0 20px ${display.iconBg}40`,
                }}
                animate={{
                  boxShadow: [
                    `0 0 15px ${display.iconBg}30`,
                    `0 0 25px ${display.iconBg}50`,
                    `0 0 15px ${display.iconBg}30`,
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <JourneyIcon id={j.id} />
              </motion.div>
              
              {/* Journey Name - Target 2: Bold white text */}
              <span 
                className="journey-name"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '16px',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  color: 'var(--text-primary)',
                  marginBottom: '6px',
                  display: 'block',
                }}
              >
                {j.name}
              </span>
              
              {/* Journey Description - Target 2: Muted smaller text */}
              <span 
                className="journey-desc"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  marginBottom: '16px',
                  display: 'block',
                  flex: 1,
                }}
              >
                {j.description}
              </span>
              
              {/* Footer: Duration + Play Button */}
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  marginTop: 'auto',
                }}
              >
                {/* Duration with clock icon */}
                <span 
                  className="journey-duration"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    fontWeight: 400,
                    color: 'var(--text-muted)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                  {display.duration}
                </span>
                
                {/* Play Button - Target 2: Filled for enabled, outline for disabled */}
                <span 
                  className="journey-play-btn" 
                  style={{ 
                    background: isEnabled ? display.iconBg : 'transparent',
                    border: isEnabled ? 'none' : '1px solid hsl(270 15% 30% / 0.5)',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: isEnabled ? display.iconColor : 'var(--text-muted)',
                    transition: 'all 0.2s ease',
                  }} 
                  aria-hidden
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* About Sound Journeys - Target 2: Info card at bottom */}
      <section 
        className="about-journeys-card"
        style={{
          padding: '20px',
          background: 'linear-gradient(165deg, hsl(270 7% 13% / 0.75), hsl(270 10% 9% / 0.85))',
          border: '1px solid hsl(270 15% 22% / 0.35)',
          borderRadius: '12px',
          boxShadow: '0 4px 20px hsl(270 20% 2% / 0.5)',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: '0 0 10px 0',
            lineHeight: 1.3,
          }}
        >
          About Sound Journeys
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            fontWeight: 400,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Each journey combines neuroadaptive sound frequencies with real-time biofeedback to guide your nervous system toward coherence. The experience adapts to your unique state, meeting you where you are.
        </p>
      </section>
    </motion.div>
  );
}
