// User and Session Storage
// Persists data to localStorage with import/export support

import { v4 as uuidv4 } from 'uuid';
import type { User, Session, SessionStats } from '../types';

const STORAGE_KEYS = {
  USERS: 'neuro-feedback-users',
  SESSIONS: 'neuro-feedback-sessions',
  CURRENT_USER: 'neuro-feedback-current-user',
  IN_PROGRESS_SESSION: 'neuro-feedback-in-progress-session',
};

/**
 * In-progress session data (persisted immediately on start)
 * This ensures startTime is not lost if the app crashes
 */
export interface InProgressSession {
  id: string;
  userId: string;
  startTime: string; // ISO string - captured at BEGIN SESSION
  journeyId?: string;
}

/**
 * Storage Manager for Users and Sessions
 */
export class StorageManager {
  /**
   * Get all users
   */
  getUsers(): User[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      return (data ? JSON.parse(data) : []) as User[];
    } catch {
      console.error('[Storage] Failed to parse users');
      return [] as User[];
    }
  }

  /**
   * Save users
   */
  private saveUsers(users: User[]): void {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }

  /**
   * Create a new user
   */
  createUser(name: string): User {
    const user: User = {
      id: uuidv4(),
      name,
      createdAt: new Date().toISOString(),
    };

    const users = this.getUsers();
    users.push(user);
    this.saveUsers(users);

    return user;
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | null {
    const users = this.getUsers();
    return users.find((u) => u.id === userId) || null;
  }

  /**
   * Update user
   */
  updateUser(userId: string, updates: Partial<User>): User | null {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === userId);

    if (index === -1) return null;

    users[index] = { ...users[index], ...updates };
    this.saveUsers(users);

    return users[index];
  }

  /**
   * Delete user and their sessions
   */
  deleteUser(userId: string): void {
    const users = this.getUsers().filter((u) => u.id !== userId);
    this.saveUsers(users);

    // Also delete user's sessions
    const sessions = this.getAllSessions().filter((s) => s.userId !== userId);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));

    // Clear current user if deleted
    if (this.getCurrentUserId() === userId) {
      this.setCurrentUser(null);
    }
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  }

  /**
   * Set current user
   */
  setCurrentUser(userId: string | null): void {
    if (userId) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, userId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    const userId = this.getCurrentUserId();
    return userId ? this.getUser(userId) : null;
  }

  // ============== In-Progress Session ==============

  /**
   * Start tracking an in-progress session (persists startTime immediately)
   * Call this at BEGIN SESSION to ensure startTime is not lost
   */
  startInProgressSession(userId: string, journeyId?: string): InProgressSession {
    const session: InProgressSession = {
      id: uuidv4(),
      userId,
      startTime: new Date().toISOString(), // Capture NOW
      journeyId,
    };
    
    localStorage.setItem(STORAGE_KEYS.IN_PROGRESS_SESSION, JSON.stringify(session));
    console.log('[Storage] In-progress session started:', session);
    
    return session;
  }

  /**
   * Get the current in-progress session (if any)
   */
  getInProgressSession(): InProgressSession | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.IN_PROGRESS_SESSION);
      return data ? JSON.parse(data) : null;
    } catch {
      console.error('[Storage] Failed to parse in-progress session');
      return null;
    }
  }

  /**
   * Clear the in-progress session (call after session is saved)
   */
  clearInProgressSession(): void {
    localStorage.removeItem(STORAGE_KEYS.IN_PROGRESS_SESSION);
    console.log('[Storage] In-progress session cleared');
  }

  // ============== Sessions ==============

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      console.error('[Storage] Failed to parse sessions');
      return [];
    }
  }

  /**
   * Save sessions
   */
  private saveSessions(sessions: Session[]): void {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  }

  /**
   * Get sessions for a user
   */
  getUserSessions(userId: string): Session[] {
    return this.getAllSessions()
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  /**
   * Save a new session
   */
  saveSession(session: Omit<Session, 'id'>): Session {
    const newSession: Session = {
      ...session,
      id: uuidv4(),
    };

    const sessions = this.getAllSessions();
    sessions.push(newSession);
    this.saveSessions(sessions);

    return newSession;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.getAllSessions().find((s) => s.id === sessionId) || null;
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): void {
    const sessions = this.getAllSessions().filter((s) => s.id !== sessionId);
    this.saveSessions(sessions);
  }

  // ============== Import/Export ==============

  /**
   * Export all data for a user (or all users if no ID provided)
   */
  exportData(userId?: string): string {
    const data: { users: User[]; sessions: Session[] } = {
      users: userId ? this.getUsers().filter((u) => u.id === userId) : this.getUsers(),
      sessions: userId ? this.getUserSessions(userId) : this.getAllSessions(),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import data from JSON string
   * Returns count of imported items
   */
  importData(jsonString: string): { users: number; sessions: number } {
    try {
      const data = JSON.parse(jsonString) as { users?: User[]; sessions?: Session[] };

      let usersImported = 0;
      let sessionsImported = 0;

      // Import users (skip duplicates by ID)
      if (data.users && Array.isArray(data.users)) {
        const existingUsers = this.getUsers();
        const existingIds = new Set(existingUsers.map((u) => u.id));

        for (const user of data.users) {
          if (!existingIds.has(user.id)) {
            existingUsers.push(user);
            usersImported++;
          }
        }

        this.saveUsers(existingUsers);
      }

      // Import sessions (skip duplicates by ID)
      if (data.sessions && Array.isArray(data.sessions)) {
        const existingSessions = this.getAllSessions();
        const existingIds = new Set(existingSessions.map((s) => s.id));

        for (const session of data.sessions) {
          if (!existingIds.has(session.id)) {
            existingSessions.push(session);
            sessionsImported++;
          }
        }

        this.saveSessions(existingSessions);
      }

      return { users: usersImported, sessions: sessionsImported };
    } catch (error) {
      console.error('[Storage] Import failed:', error);
      throw new Error('Invalid import data format');
    }
  }

  /**
   * Download data as JSON file
   */
  downloadExport(userId?: string): void {
    const data = this.exportData(userId);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `neuro-feedback-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
}

// Singleton instance
export const storage = new StorageManager();

/**
 * Calculate session stats
 */
export function calculateSessionStats(session: Session): SessionStats {
  const totalLength = session.duration;
  const coherencePercent =
    session.duration > 0 ? (session.coherenceTime / session.duration) * 100 : 0;

  // Calculate achievement score based on performance
  let achievementScore: string;
  if (coherencePercent >= 70) {
    achievementScore = 'Mastery';
  } else if (coherencePercent >= 50) {
    achievementScore = 'Flowing';
  } else if (coherencePercent >= 30) {
    achievementScore = 'Settled';
  } else if (coherencePercent >= 15) {
    achievementScore = 'Emerging';
  } else {
    achievementScore = 'Beginning';
  }

  return {
    totalLength,
    longestStreak: session.longestStreak,
    avgCoherence: session.avgCoherence,
    coherencePercent,
    achievementScore,
  };
}

/**
 * Format milliseconds to MM:SS
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format milliseconds to MM:SS min
 */
export function formatTimeWithUnit(ms: number): string {
  return `${formatTime(ms)} min`;
}
