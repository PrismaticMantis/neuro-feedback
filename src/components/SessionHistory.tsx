// Session History – list of recent sessions

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatTime } from '../lib/storage';
import { getUserSessionRecords, getJourneys } from '../lib/session-storage';
import type { User } from '../types';

interface SessionHistoryProps {
  currentUser: User | null;
}

function getJourneyName(journeyId: string): string {
  const j = getJourneys().find((g) => g.id === journeyId);
  return j?.name ?? 'Session';
}

export function SessionHistory({ currentUser }: SessionHistoryProps) {
  const userId = currentUser?.id ?? null;
  const records = userId ? getUserSessionRecords(userId) : [];

  return (
    <motion.div
      className="screen screen-history"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      style={{ paddingBottom: 80 }}
    >
      <header className="screen-header">
        <h1>Session History</h1>
        <p className="footer-hint" style={{ marginTop: 8 }}>
          {currentUser ? `${currentUser.name}'s sessions` : 'Select a user on Home'}
        </p>
      </header>

      <div className="history-content">
        {!userId ? (
          <p className="footer-hint">Select a user on Home to see session history.</p>
        ) : records.length === 0 ? (
          <p className="footer-hint">No sessions yet.</p>
        ) : (
          <ul className="history-list">
            {records.map((r) => (
              <li key={r.id}>
                <Link to={`/history/${r.id}`} className="history-item">
                  <span className="history-meta">
                    {new Date(r.endedAt).toLocaleDateString()} · {new Date(r.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="history-journey">{getJourneyName(r.journeyId)}</span>
                  <span className="history-stats">
                    {formatTime(r.durationMs)} · {Math.round(r.coherencePercent)}% · {formatTime(r.longestStreakMs)} streak
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="screen-footer" style={{ marginTop: 24 }}>
        <Link to="/home" className="btn btn-text">
          ← Back to Home
        </Link>
      </footer>
    </motion.div>
  );
}
