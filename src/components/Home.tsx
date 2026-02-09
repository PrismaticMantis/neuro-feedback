// UI reference: design/targets/1 - Start Session.png

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ENABLE_JOURNEYS } from '../lib/feature-flags';
import type { User } from '../types';

interface HomeProps {
  currentUser: User | null;
  users: User[];
  onCreateUser: (name: string) => User;
  onSelectUser: (userId: string) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Home({ currentUser, users, onCreateUser, onSelectUser }: HomeProps) {
  const navigate = useNavigate();
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Handle first-run: no users exist
  useEffect(() => {
    if (users.length === 0 && !showCreateUser) {
      setShowCreateUser(true);
    }
  }, [users.length, showCreateUser]);

  const handleCreateUser = () => {
    const name = newUserName.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      onCreateUser(name); // User is auto-selected by onCreateUser
      setNewUserName('');
      setShowCreateUser(false);
    } catch (e) {
      console.error('Failed to create user:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartSession = () => {
    if (!currentUser) {
      setShowCreateUser(true);
      return;
    }
    // Always navigate to Journeys page to select a journey
    if (ENABLE_JOURNEYS) {
      navigate('/journeys');
    } else {
      navigate('/setup');
    }
  };

  // First-run: show create user modal
  if (showCreateUser && users.length === 0) {
    return (
      <motion.div
        className="screen screen-home"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="create-user-modal">
          <div className="create-user-card">
            <h2>Create Your Profile</h2>
            <p className="footer-hint create-user-hint">
              Get started by creating your profile
            </p>
            <div className="new-user-form">
              <input
                type="text"
                placeholder="Enter your name..."
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateUser()}
                autoFocus
              />
              <motion.button
                className="btn btn-primary btn-large"
                onClick={handleCreateUser}
                disabled={!newUserName.trim() || isCreating}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isCreating ? 'Creating...' : 'Create Profile'}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // No user selected: show prompt
  if (!currentUser) {
    return (
      <motion.div
        className="screen screen-home"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="create-user-modal">
          <div className="create-user-card">
            <h2>Select or Create Profile</h2>
            <p className="footer-hint create-user-hint">
              Choose an existing profile or create a new one
            </p>
            {users.length > 0 && (
              <div className="user-list create-user-list">
                {users.map((user) => (
                  <button
                    key={user.id}
                    className="user-btn"
                    onClick={() => {
                      onSelectUser(user.id);
                    }}
                  >
                    {user.name}
                  </button>
                ))}
              </div>
            )}
            <div className="new-user-form">
              <input
                type="text"
                placeholder="Enter name for new profile..."
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateUser()}
              />
              <motion.button
                className="btn btn-secondary"
                onClick={handleCreateUser}
                disabled={!newUserName.trim() || isCreating}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isCreating ? 'Creating...' : 'Create New'}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Normal Home screen — Lovable verbatim spec ──
  const greeting = getGreeting();
  const userName = currentUser.name;

  return (
    <motion.div
      className="screen screen-home"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="home-content-container">
        {/* ── Header ── */}
        <header className="home-header">
          <div className="home-greeting">
            <p className="home-greeting-text">{greeting}</p>
            <h1 className="home-user-name">{userName}</h1>
          </div>
          <div className="home-header-actions">
            <button type="button" className="home-icon-btn" aria-label="Notifications">
              {/* Bell — lucide */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
            </button>
            <button type="button" className="home-icon-btn" aria-label="Settings">
              {/* Settings gear — lucide */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </header>

        {/* ── CTA Section — animated entry ── */}
        <section className="home-cta-section">
          <div className="home-card-glass">
            {/* LAYER 2: Pulsing champagne orb (behind content) */}
            <div className="home-orb-wrapper">
              <div className="home-orb" />
            </div>

            {/* Content (above orb via position: relative) */}
            <div className="home-card-content">
              {/* LAYER 3: Sparkles icon with static glow halo */}
              <div className="home-icon-container">
                {/* Sparkles — lucide (4-point star with small + cross accent) */}
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(45 55% 70%)' }}>
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .963L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
                  <path d="M20 3v4"/>
                  <path d="M22 5h-4"/>
                </svg>
              </div>

              <h2 className="home-heading">Ready to begin?</h2>

              <p className="home-subtext">
                Release mental strain and access spacious, clear thinking
              </p>

              <button
                className="home-start-btn"
                onClick={handleStartSession}
              >
                {/* Play — lucide */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="6 3 20 12 6 21 6 3"/>
                </svg>
                Start Session
              </button>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
