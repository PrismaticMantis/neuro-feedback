// Journey Selection – Choose Journey (Lovable layout)
// Only Creative Flow is wired; other cards show "Coming soon".

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getJourneys, setLastJourneyId } from '../lib/session-storage';
import type { User } from '../types';

const ENABLED_JOURNEY_ID = 'creativeFlow';

/* Journey display tokens from Lovable spec (duration + color) */
const JOURNEY_DISPLAY: Record<string, { duration: string; color: string }> = {
  calm: { duration: '15 min', color: '#4d99b3' },
  deepRest: { duration: '25 min', color: '#8c4da6' },
  creativeFlow: { duration: '20 min', color: '#d4b86b' },
  nightWindDown: { duration: '20 min', color: '#6b5299' },
};

function JourneyIcon({ id }: { id: string }) {
  if (id === 'calm') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12c0 5 4 8 10 8s10-3 10-8-4-8-10-8-10 3-10 8z"/><path d="M2 12h20"/></svg>
    );
  }
  if (id === 'deepRest') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    );
  }
  if (id === 'creativeFlow') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" />
      </svg>
    );
  }
  if (id === 'nightWindDown') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="2" y1="16" x2="22" y2="16"/></svg>
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
          const display = JOURNEY_DISPLAY[j.id] ?? { duration: '15 min', color: '#9e59b8' };
          const isEnabled = j.id === ENABLED_JOURNEY_ID;
          return (
            <motion.button
              key={j.id}
              type="button"
              className={`journey-card ${!isEnabled ? 'journey-card-disabled' : ''}`}
              onClick={() => handleSelect(j.id)}
              whileHover={isEnabled ? { scale: 1.02 } : undefined}
              whileTap={isEnabled ? { scale: 0.98 } : undefined}
              aria-disabled={!isEnabled}
            >
              <div className="journey-card-icon" style={{ background: display.color, boxShadow: `0 0 20px ${display.color}40` }}>
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
                <span className="journey-play-btn" style={{ background: display.color, color: '#fff' }} aria-hidden>
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
          Sound journeys combine binaural tones and ambient layers to support focus, relaxation, or sleep. Choose a journey, connect your Muse headband, and follow the session setup to begin.
        </p>
      </section>
    </motion.div>
  );
}
