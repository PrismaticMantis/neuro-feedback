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
    >
      <header className="journey-select-header">
        <Link to="/home" className="btn-ghost" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </Link>
        <div className="journey-select-title-block">
          <h1 className="journey-select-title">Choose Journey</h1>
          <p className="journey-select-subtitle">Select your path to clarity</p>
        </div>
      </header>

      {comingSoonId && (
        <div className="journey-coming-soon-toast" role="status">
          Coming soon
        </div>
      )}
      <div className="journey-grid">
        {journeys.map((j) => {
          const display = JOURNEY_DISPLAY[j.id] ?? { duration: '15 min', iconColor: '#9e59b8', cardBg: 'grey' };
          return (
            <motion.button
              key={j.id}
              type="button"
              className={`journey-card journey-card-${display.cardBg}`}
              onClick={() => handleSelect(j.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="journey-card-icon" style={{ background: display.iconColor, boxShadow: `0 0 20px ${display.iconColor}40` }}>
                <JourneyIcon id={j.id} />
              </div>
              <span className="journey-name">{j.name}</span>
              <span className="journey-desc">{j.description}</span>
              <span className="journey-duration">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                {display.duration}
              </span>
              <div className="journey-card-footer">
                <span />
                <span className="journey-play-btn" style={{ background: display.iconColor, color: '#fff' }} aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <section className="about-journeys-card">
        <h3>About Sound Journeys</h3>
        <p>
          Each journey combines neuroadaptive sound frequencies with real-time biofeedback to guide your nervous system toward coherence. The experience adapts to your unique state, meeting you where you are.
        </p>
      </section>
    </motion.div>
  );
}
