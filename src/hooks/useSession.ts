// React hook for session management

import { useState, useCallback, useRef, useEffect } from 'react';
import { storage, calculateSessionStats } from '../lib/storage';
import type { User, Session, SessionStats, AppScreen } from '../types';

export interface UseSessionReturn {
  // User management
  currentUser: User | null;
  users: User[];
  createUser: (name: string) => User;
  selectUser: (userId: string) => void;
  deleteUser: (userId: string) => void;

  // Session state
  isSessionActive: boolean;
  sessionStartTime: number | null;
  sessionDuration: number;
  quietPowerTime: number;
  longestStreak: number;
  currentStreak: number;
  coherenceHistory: number[];

  // Session controls
  startSession: () => void;
  endSession: () => Session | null;
  updateQuietPowerState: (isActive: boolean, coherence: number) => void;

  // Completed session
  lastSession: Session | null;
  lastSessionStats: SessionStats | null;

  // Navigation
  screen: AppScreen;
  setScreen: (screen: AppScreen) => void;

  // Data management
  exportData: () => void;
  importData: (file: File) => Promise<{ users: number; sessions: number }>;
  getUserSessions: (userId: string) => Session[];
}

export function useSession(): UseSessionReturn {
  // User state
  const [currentUser, setCurrentUser] = useState<User | null>(storage.getCurrentUser());
  const [users, setUsers] = useState<User[]>(storage.getUsers());

  // Session state
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [quietPowerTime, setQuietPowerTime] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [coherenceHistory, setCoherenceHistory] = useState<number[]>([]);

  // Session result
  const [lastSession, setLastSession] = useState<Session | null>(null);
  const [lastSessionStats, setLastSessionStats] = useState<SessionStats | null>(null);

  // Navigation
  const [screen, setScreen] = useState<AppScreen>('setup');

  // Refs for tracking
  const quietPowerStartRef = useRef<number | null>(null);
  const lastCoherenceTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Update duration every second
  useEffect(() => {
    if (isSessionActive && sessionStartTime) {
      durationIntervalRef.current = setInterval(() => {
        setSessionDuration(Date.now() - sessionStartTime);
      }, 1000);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isSessionActive, sessionStartTime]);

  // User management
  const createUser = useCallback((name: string) => {
    const user = storage.createUser(name);
    setUsers(storage.getUsers());
    storage.setCurrentUser(user.id);
    setCurrentUser(user);
    return user;
  }, []);

  const selectUser = useCallback((userId: string) => {
    storage.setCurrentUser(userId);
    setCurrentUser(storage.getUser(userId));
  }, []);

  const deleteUser = useCallback((userId: string) => {
    storage.deleteUser(userId);
    setUsers(storage.getUsers());
    if (currentUser?.id === userId) {
      setCurrentUser(null);
    }
  }, [currentUser]);

  // Session controls
  const startSession = useCallback(() => {
    const now = Date.now();
    setSessionStartTime(now);
    setSessionDuration(0);
    setQuietPowerTime(0);
    setLongestStreak(0);
    setCurrentStreak(0);
    setCoherenceHistory([]);
    setIsSessionActive(true);
    quietPowerStartRef.current = null;
    lastCoherenceTimeRef.current = now;
    setScreen('session');
  }, []);

  const endSession = useCallback(() => {
    if (!isSessionActive || !sessionStartTime || !currentUser) {
      setIsSessionActive(false);
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - sessionStartTime;

    // Calculate average coherence
    const avgCoherence =
      coherenceHistory.length > 0
        ? coherenceHistory.reduce((a, b) => a + b, 0) / coherenceHistory.length
        : 0;

    const session = storage.saveSession({
      userId: currentUser.id,
      startTime: new Date(sessionStartTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      duration,
      quietPowerTime,
      longestStreak,
      avgCoherence,
      coherenceHistory,
    });

    setLastSession(session);
    setLastSessionStats(calculateSessionStats(session));
    setIsSessionActive(false);
    setScreen('summary');

    return session;
  }, [
    isSessionActive,
    sessionStartTime,
    currentUser,
    quietPowerTime,
    longestStreak,
    coherenceHistory,
  ]);

  const updateQuietPowerState = useCallback(
    (isActive: boolean, coherence: number) => {
      if (!isSessionActive) return;

      const now = Date.now();

      // Sample coherence history (roughly every second)
      if (now - lastCoherenceTimeRef.current >= 1000) {
        setCoherenceHistory((prev) => [...prev, coherence]);
        lastCoherenceTimeRef.current = now;
      }

      if (isActive) {
        // In quiet power state
        if (quietPowerStartRef.current === null) {
          quietPowerStartRef.current = now;
        }

        const streak = now - quietPowerStartRef.current;
        setCurrentStreak(streak);

        if (streak > longestStreak) {
          setLongestStreak(streak);
        }
      } else {
        // Not in quiet power state
        if (quietPowerStartRef.current !== null) {
          // Add time spent in quiet power
          const timeSpent = now - quietPowerStartRef.current;
          setQuietPowerTime((prev) => prev + timeSpent);
          quietPowerStartRef.current = null;
        }
        setCurrentStreak(0);
      }
    },
    [isSessionActive, longestStreak]
  );

  // Data management
  const exportData = useCallback(() => {
    storage.downloadExport(currentUser?.id);
  }, [currentUser]);

  const importData = useCallback(async (file: File) => {
    const text = await file.text();
    const result = storage.importData(text);
    setUsers(storage.getUsers());
    return result;
  }, []);

  const getUserSessions = useCallback((userId: string) => {
    return storage.getUserSessions(userId);
  }, []);

  return {
    // User management
    currentUser,
    users,
    createUser,
    selectUser,
    deleteUser,

    // Session state
    isSessionActive,
    sessionStartTime,
    sessionDuration,
    quietPowerTime,
    longestStreak,
    currentStreak,
    coherenceHistory,

    // Session controls
    startSession,
    endSession,
    updateQuietPowerState,

    // Completed session
    lastSession,
    lastSessionStats,

    // Navigation
    screen,
    setScreen,

    // Data management
    exportData,
    importData,
    getUserSessions,
  };
}
