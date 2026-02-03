// UI reference: design/targets/2 - Choose Journey.png

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getJourneys, setLastJourneyId } from '../lib/session-storage';
import type { User } from '../types';

const ENABLED_JOURNEY_ID = 'creativeFlow';

/* Journey display tokens from Lovable spec (duration + icon color + card background) */
const JOURNEY_DISPLAY: Record<string, { 
  duration: string; 
  iconColor: string;
  cardBg: 'grey' | 'purple';
}> = {
  calm: { duration: '15 min', iconColor: '#4d99b3', cardBg: 'grey' },
  deepRest: { duration: '25 min', iconColor: '#a67bc8', cardBg: 'purple' },
  creativeFlow: { duration: '20 min', iconColor: '#d9c478', cardBg: 'grey' },
  nightWindDown: { duration: '30 min', iconColor: '#a67bc8', cardBg: 'purple' },
};

function JourneyIcon({ id }: { id: string }) {
  if (id === 'calm') {
    // Three horizontal wavy lines
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c1-1.5 3-1.5 5 0s4 1.5 6 0 4-1.5 6 0 4-1.5 6 0"/>
        <path d="M2 8c1-1.5 3-1.5 5 0s4 1.5 6 0 4-1.5 6 0 4-1.5 6 0"/>
        <path d="M2 16c1-1.5 3-1.5 5 0s4 1.5 6 0 4-1.5 6 0 4-1.5 6 0"/>
      </svg>
    );
  }
  if (id === 'deepRest') {
    // Crescent moon with small star/swirl
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        <circle cx="18" cy="6" r="1.5" fill="currentColor"/>
      </svg>
    );
  }
  if (id === 'creativeFlow') {
    // Four-point sparkle/star (already correct)
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" />
      </svg>
    );
  }
  if (id === 'nightWindDown') {
    // Two horizontal lines with downward arrow
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="3" y1="14" x2="21" y2="14"/>
        <path d="M12 14l-3 3 3 3"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
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
        padding: `0 var(--space-page-x) 80px`,
        maxWidth: 'var(--container-max-width)',
        margin: '0 auto',
        outline: '4px solid red',
      }}
    >
      <header 
        className="journey-select-header"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-inner)',
          padding: 'var(--space-card-gap) 0 var(--space-card-gap)',
        }}
      >
        <Link 
          to="/home" 
          className="btn-ghost" 
          aria-label="Back"
          style={{
            padding: 'calc(var(--space-tight) + 4px)',
            borderRadius: 'var(--radius-button-ghost)',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background var(--transition-default)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </Link>
        <div 
          className="journey-select-title-block"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-tight)',
          }}
        >
          <h1 
            className="journey-select-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--font-heading-1-size)',
              fontWeight: 'var(--font-heading-1-weight)',
              lineHeight: 'var(--font-heading-1-line-height)',
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Choose Journey
          </h1>
          <p 
            className="journey-select-subtitle"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--font-caption-size)',
              fontWeight: 'var(--weight-regular)',
              color: 'var(--text-muted)',
              margin: 0,
              lineHeight: 'var(--font-caption-line-height)',
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
      <div 
        className="journey-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-card-gap)',
          marginBottom: 'var(--space-section-y)',
        }}
      >
        {journeys.map((j) => {
          const display = JOURNEY_DISPLAY[j.id] ?? { duration: '15 min', iconColor: '#9e59b8', cardBg: 'grey' };
          const isPurpleCard = display.cardBg === 'purple';
          return (
            <motion.button
              key={j.id}
              type="button"
              className={`journey-card journey-card-${display.cardBg}`}
              onClick={() => handleSelect(j.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textAlign: 'left',
                padding: 'var(--padding-card-glass)',
                borderRadius: 'var(--radius-card-glass)',
                cursor: 'pointer',
                transition: 'all var(--transition-card)',
                position: 'relative',
                overflow: 'hidden',
                backdropFilter: 'var(--bg-card-glass-backdrop)',
                boxShadow: 'var(--shadow-card-glass)',
                background: isPurpleCard 
                  ? 'linear-gradient(165deg, hsl(275 7% 14% / 0.7), hsl(275 10% 8% / 0.8))'
                  : 'var(--bg-card-glass)',
                border: isPurpleCard
                  ? '1px solid hsl(275 15% 25% / 0.3)'
                  : 'var(--border-card-glass)',
                gap: 0,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}>
                <div 
                  className="journey-card-icon" 
                  style={{ 
                    background: display.iconColor, 
                    boxShadow: `0 0 20px ${display.iconColor}40`,
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 'var(--space-inner)',
                    flexShrink: 0,
                    color: 'var(--color-bg-primary)',
                  }}
                >
                  <JourneyIcon id={j.id} />
                </div>
                <span 
                  className="journey-name"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--font-heading-3-size)',
                    fontWeight: 'var(--font-heading-3-weight)',
                    lineHeight: 'var(--font-heading-3-line-height)',
                    color: 'var(--text-primary)',
                    marginBottom: 'var(--space-tight)',
                    position: 'relative',
                    zIndex: 1,
                    display: 'block',
                  }}
                >
                  {j.name}
                </span>
                <span 
                  className="journey-desc"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--font-body-size)',
                    fontWeight: 'var(--weight-regular)',
                    color: 'var(--text-muted)',
                    lineHeight: 'var(--font-body-line-height)',
                    marginBottom: 'var(--space-inner)',
                    position: 'relative',
                    zIndex: 1,
                    display: 'block',
                    flex: 1,
                  }}
                >
                  {j.description}
                </span>
                <div 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <span 
                    className="journey-duration"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-tight)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--font-caption-size)',
                      fontWeight: 'var(--weight-regular)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    {display.duration}
                  </span>
                  <span 
                    className="journey-play-btn" 
                    style={{ 
                      background: j.id === ENABLED_JOURNEY_ID ? display.iconColor : 'transparent',
                      border: j.id === ENABLED_JOURNEY_ID ? 'none' : '1px solid var(--border-card-glass)',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: j.id === ENABLED_JOURNEY_ID ? 'var(--color-bg-primary)' : 'var(--text-primary)',
                    }} 
                    aria-hidden
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <section 
        className="about-journeys-card"
        style={{
          padding: 'var(--padding-card-glass)',
          background: 'var(--bg-card-glass)',
          border: 'var(--border-card-glass)',
          borderRadius: 'var(--radius-card-glass)',
          backdropFilter: 'var(--bg-card-glass-backdrop)',
          boxShadow: 'var(--shadow-card-glass)',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--font-heading-3-size)',
            fontWeight: 'var(--font-heading-3-weight)',
            color: 'var(--text-primary)',
            margin: `0 0 var(--space-inner) 0`,
            lineHeight: 'var(--font-heading-3-line-height)',
          }}
        >
          About Sound Journeys
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--font-body-size)',
            fontWeight: 'var(--weight-regular)',
            color: 'var(--text-muted)',
            lineHeight: 'var(--font-body-line-height)',
            margin: 0,
          }}
        >
          Each journey combines neuroadaptive sound frequencies with real-time biofeedback to guide your nervous system toward coherence. The experience adapts to your unique state, meeting you where you are.
        </p>
      </section>
    </motion.div>
  );
}
