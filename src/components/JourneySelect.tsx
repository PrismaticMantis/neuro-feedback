// UI reference: design/targets/2 - Choose Journey.png
// Lovable design tokens applied: icon circles, card backgrounds, play buttons, spacing

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getJourneys, setLastJourneyId } from '../lib/session-storage';
import type { User } from '../types';

const ENABLED_JOURNEY_ID = 'creativeFlow';

/**
 * Journey theme map — pixel-matched to Lovable "2 - Choose Journey.png".
 *
 * Each card has a distinct gradient wash concentrated at the top, a matching
 * accent border, and a soft ambient glow.  The `playAccent` flag controls
 * which card gets the gold play button (Night Wind-Down in the Lovable spec).
 */
const JOURNEY_THEMES: Record<string, {
  duration: string;
  iconColor: string;
  iconBg: string;
  cardGradient: string;
  cardBorder: string;
  cardGlow: string;
  playAccent: boolean;       // true = gold play button (Lovable: Night Wind-Down)
}> = {
  calm: {
    duration: '15 min',
    iconColor: '#ffffff',
    iconBg: '#5B8DEF',
    // Visible blue wash at top fading to dark
    cardGradient: 'linear-gradient(170deg, hsl(215 25% 20% / 0.7) 0%, hsl(220 15% 12% / 0.85) 55%, hsl(225 12% 9% / 0.92) 100%)',
    cardBorder: '1px solid hsl(215 22% 30% / 0.35)',
    cardGlow: '0 4px 24px hsl(215 30% 10% / 0.35), inset 0 1px 0 hsl(215 30% 45% / 0.06)',
    playAccent: false,
  },
  deepRest: {
    duration: '25 min',
    iconColor: '#ffffff',
    iconBg: '#9B6BC8',
    // Prominent purple wash at top
    cardGradient: 'linear-gradient(170deg, hsl(275 28% 22% / 0.7) 0%, hsl(275 18% 14% / 0.8) 50%, hsl(275 12% 9% / 0.92) 100%)',
    cardBorder: '1px solid hsl(275 25% 32% / 0.4)',
    cardGlow: '0 4px 24px hsl(275 30% 10% / 0.35), inset 0 1px 0 hsl(275 30% 45% / 0.06)',
    playAccent: false,
  },
  creativeFlow: {
    duration: '20 min',
    iconColor: '#0c0a0e',
    iconBg: '#D9C478',
    // Warm gold wash at top
    cardGradient: 'linear-gradient(170deg, hsl(45 22% 18% / 0.7) 0%, hsl(42 14% 12% / 0.82) 50%, hsl(40 10% 9% / 0.92) 100%)',
    cardBorder: '1px solid hsl(45 20% 30% / 0.35)',
    cardGlow: '0 4px 24px hsl(45 25% 10% / 0.35), inset 0 1px 0 hsl(45 30% 45% / 0.06)',
    playAccent: false,
  },
  nightWindDown: {
    duration: '30 min',
    iconColor: '#ffffff',
    iconBg: '#7C6BC8',
    // Purple-mauve wash at top
    cardGradient: 'linear-gradient(170deg, hsl(260 25% 22% / 0.7) 0%, hsl(260 18% 14% / 0.8) 50%, hsl(260 12% 9% / 0.92) 100%)',
    cardBorder: '1px solid hsl(260 22% 32% / 0.4)',
    cardGlow: '0 4px 24px hsl(260 30% 10% / 0.35), inset 0 1px 0 hsl(260 25% 45% / 0.06)',
    playAccent: true,          // Gold play button per Lovable spec
  },
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
        padding: '0 20px 100px', // Lovable Target 2: tighter side padding so cards fill width
        maxWidth: '820px',       // Narrower container → cards fill proportionally more
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
          const theme = JOURNEY_THEMES[j.id] ?? JOURNEY_THEMES.creativeFlow;
          // Play button: gold accent per Lovable reference (Night Wind-Down),
          // NOT tied to isEnabled — visual parity takes priority.
          const goldPlay = theme.playAccent;

          return (
            <motion.button
              key={j.id}
              type="button"
              className="journey-card"
              onClick={() => handleSelect(j.id)}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textAlign: 'left',
                padding: '22px',
                borderRadius: '14px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden',
                background: theme.cardGradient,
                border: theme.cardBorder,
                boxShadow: theme.cardGlow,
                backdropFilter: 'blur(16px)',
                minHeight: '200px',         // Taller to match Lovable
              }}
            >
              {/* Icon Circle - Lovable: 44px rounded-lg with accent fill */}
              <div
                className="journey-card-icon"
                style={{
                  background: theme.iconBg,
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  flexShrink: 0,
                  color: theme.iconColor,
                  boxShadow: `0 0 18px ${theme.iconBg}35`,
                }}
              >
                <JourneyIcon id={j.id} />
              </div>

              {/* Journey Name */}
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

              {/* Journey Description */}
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
                  {theme.duration}
                </span>

                {/* Play Button — gold accent only on Night Wind-Down per Lovable */}
                <span
                  className="journey-play-btn"
                  style={{
                    background: goldPlay ? '#D9C478' : 'hsl(270 8% 18% / 0.55)',
                    border: goldPlay ? 'none' : '1px solid hsl(270 12% 28% / 0.4)',
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: goldPlay ? '#0c0a0e' : 'var(--text-subtle)',
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

      {/* About Sound Journeys - Target 2: Neutral info card at bottom */}
      <section
        className="about-journeys-card"
        style={{
          padding: '22px 24px',
          background: 'linear-gradient(170deg, hsl(270 8% 14% / 0.65), hsl(270 10% 10% / 0.8))',
          border: '1px solid hsl(270 12% 24% / 0.3)',
          borderRadius: '14px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 20px hsl(270 20% 2% / 0.35)',
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
