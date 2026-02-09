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

  // Normal Home screen: Lovable-style
  const greeting = getGreeting();
  const userName = currentUser.name;

  return (
    <motion.div
      className="screen screen-home"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      {/* Header: greeting left, actions right (Lovable spec) */}
      <header className="home-header">
        <div className="home-greeting">
          <p className="greeting-text text-caption">{greeting}</p>
          <p className="user-name-text text-heading-1">{userName}</p>
        </div>
        <div className="home-header-actions">
          <button type="button" className="btn-ghost" aria-label="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <button type="button" className="btn-ghost" aria-label="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </header>

      {/* Main Content - Centered Card */}
      <main className="home-main">
        <motion.div
          className="home-hero-card"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          {/* Icon Circle - multi-point sparkle matching Lovable spec */}
          <div className="hero-icon-circle">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              {/* Main 4-point star */}
              <path d="M12 1l2.2 8.2L22 12l-7.8 2.8L12 23l-2.2-8.2L2 12l7.8-2.8L12 1z" />
              {/* Small diagonal sparkle points */}
              <path d="M5.5 5.5l1.4 2.1L5.5 9.7 4.1 7.6 5.5 5.5z" opacity="0.7"/>
              <path d="M18.5 5.5l1.4 2.1-1.4 2.1-1.4-2.1 1.4-2.1z" opacity="0.7"/>
              <path d="M5.5 14.3l1.4 2.1-1.4 2.1-1.4-2.1 1.4-2.1z" opacity="0.7"/>
              <path d="M18.5 14.3l1.4 2.1-1.4 2.1-1.4-2.1 1.4-2.1z" opacity="0.7"/>
            </svg>
          </div>

          {/* Heading — Heading 2 (24px, 500, Inter) per Lovable spec */}
          <h1 className="hero-title">Ready to begin?</h1>

          {/* Description (Lovable copy) - caption-sized subtitle per spec */}
          <p className="hero-description">
            Release mental strain and access spacious, clear thinking
          </p>

          {/* Primary CTA — compact pill button per Lovable spec */}
          <motion.button
            className="btn btn-primary"
            onClick={handleStartSession}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-tight)', position: 'relative', zIndex: 1 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Start Session
          </motion.button>
        </motion.div>
      </main>
    </motion.div>
  );
}
