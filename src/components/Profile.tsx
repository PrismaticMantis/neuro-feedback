// UI reference: design/targets/7 - Profile.png

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getUserSessionRecords, getJourneys } from '../lib/session-storage';
import type { SessionRecord } from '../lib/session-storage';
import { ProfileUserList } from '../lib/get-profile-user';
import { BUILD_STAMP } from '../lib/build-stamp';
import type { User } from '../types';

function getJourneyName(journeyId: string): string {
  const j = getJourneys().find((g) => g.id === journeyId);
  return j?.name ?? 'Session';
}

/* Journey dot colors from Lovable spec */
const JOURNEY_COLORS: Record<string, string> = {
  calm: '#4d99b3',
  deepRest: '#8c4da6',
  creativeFlow: '#d4b86b',
  nightWindDown: '#6b5299',
};

export interface ProfileProps {
  currentUser: User | null;
  users: User[];
  onCreateUser: (name: string) => User;
  onSelectUser: (userId: string) => void;
}

export function Profile({
  currentUser,
  users,
  onCreateUser,
  onSelectUser,
}: ProfileProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const userId = currentUser?.id ?? null;
  const records: SessionRecord[] = userId ? getUserSessionRecords(userId) : [];

  const handleCreateUser = () => {
    const name = newUserName.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      onCreateUser(name);
      setNewUserName('');
      setShowCreateForm(false);
    } catch (e) {
      console.error('Failed to create user:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const totalSessions = records.length;
  const totalMinutes = records.reduce((sum, r) => sum + r.durationMs / 60000, 0);

  return (
    <motion.div
      className="screen screen-profile"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <header className="profile-header">
        <h1>Profile</h1>
      </header>

      {currentUser ? (
        <>
          <div className="profile-user-card">
            <div className="profile-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div className="profile-user-info">
              <p className="profile-user-name">{currentUser.name}</p>
              <p className="profile-user-meta">Practicing since {new Date(currentUser.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
            <button type="button" className="btn-ghost" aria-label="Settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>

          <div className="profile-summary-row">
            <div className="profile-summary-card">
              <div className="profile-summary-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <p className="profile-summary-label">Total Sessions</p>
              <p className="profile-summary-value">{totalSessions}</p>
            </div>
            <div className="profile-summary-card">
              <div className="profile-summary-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </div>
              <p className="profile-summary-label">Total Time</p>
              <p className="profile-summary-value">{Math.round(totalMinutes)} min</p>
            </div>
          </div>
        </>
      ) : (
        <div className="setup-section profile-no-user-section">
          <p className="text-caption">No profile selected. Create or select a profile below.</p>
          {users.length > 0 && (
            <ProfileUserList
              users={users as User[]}
              currentUserId={userId}
              onSelect={onSelectUser}
            />
          )}
          {!showCreateForm ? (
            <button type="button" className="btn btn-secondary profile-add-btn" onClick={() => setShowCreateForm(true)}>
              + Add New Profile
            </button>
          ) : (
            <div className="new-user-form profile-create-form">
              <input
                type="text"
                placeholder="Enter name..."
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateUser();
                  if (e.key === 'Escape') { setShowCreateForm(false); setNewUserName(''); }
                }}
                autoFocus
              />
              <div className="profile-create-actions">
                <button type="button" className="btn btn-text" onClick={() => { setShowCreateForm(false); setNewUserName(''); }}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleCreateUser} disabled={!newUserName.trim() || isCreating}>
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <h2 className="profile-sessions-title">Your Sessions</h2>
      {!userId ? (
        <p className="text-caption">Select a profile to see session history.</p>
      ) : records.length === 0 ? (
        <p className="text-caption">No sessions yet. Start a session to see history here.</p>
      ) : (
        <ul className="profile-sessions-list">
          {records.slice(0, 10).map((r) => (
            <li key={r.id}>
              <Link to={`/history/${r.id}`} className="profile-session-item">
                <span className="profile-session-dot" style={{ background: JOURNEY_COLORS[r.journeyId] ?? 'var(--color-accent-secondary)' }} />
                <div className="profile-session-content">
                  <p className="profile-session-name">{getJourneyName(r.journeyId)}</p>
                  <p className="profile-session-date">
                    {new Date(r.endedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, {new Date(r.endedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <div className="profile-session-meta">
                  <span className="profile-session-duration">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="profile-session-duration-icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    {Math.round(r.durationMs / 60000)} min
                  </span>
                  <span className="profile-session-coherence">{Math.round(r.coherencePercent)}%</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Build stamp footer - confirms UI updates are deployed */}
      <footer className="profile-build-stamp">
        <span className="profile-build-stamp-text">{BUILD_STAMP}</span>
      </footer>
    </motion.div>
  );
}
