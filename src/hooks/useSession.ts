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
  flowStateTime: number;
  longestStreak: number;
  currentStreak: number;
  coherenceHistory: number[];

  // Session controls
  startSession: () => void;
  endSession: () => Session | null;
  updateFlowState: (isActive: boolean, coherence: number) => void;

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
  const [flowStateTime, setFlowStateTime] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [coherenceHistory, setCoherenceHistory] = useState<number[]>([]);

  // Session result
  const [lastSession, setLastSession] = useState<Session | null>(null);
  const [lastSessionStats, setLastSessionStats] = useState<SessionStats | null>(null);

  // Navigation
  const [screen, setScreen] = useState<AppScreen>('setup');

  // Refs for tracking
  const flowStateStartRef = useRef<number | null>(null);
  const lastCoherenceTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Refs to track current values for accurate endSession calculation
  const flowStateTimeRef = useRef<number>(0);
  const longestStreakRef = useRef<number>(0);

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
    setFlowStateTime(0);
    setLongestStreak(0);
    setCurrentStreak(0);
    setCoherenceHistory([]);
    setIsSessionActive(true);
    flowStateStartRef.current = null;
    flowStateTimeRef.current = 0;
    longestStreakRef.current = 0;
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

    // CRITICAL FIX: Add final flow period if session ends while still in flow state
    let finalFlowStateTime = flowStateTimeRef.current;
    let finalLongestStreak = longestStreakRef.current;
    
    if (flowStateStartRef.current !== null) {
      // User is still in flow state - add the final period
      const finalTimeSpent = endTime - flowStateStartRef.current;
      finalFlowStateTime = flowStateTimeRef.current + finalTimeSpent;
      
      // Update longest streak if this final period is longer
      const finalStreak = endTime - flowStateStartRef.current;
      if (finalStreak > longestStreakRef.current) {
        finalLongestStreak = finalStreak;
      }
    }

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
      flowStateTime: finalFlowStateTime,
      longestStreak: finalLongestStreak,
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
    coherenceHistory,
  ]);

  const updateFlowState = useCallback(
    (isActive: boolean, coherence: number) => {
      if (!isSessionActive) return;

      const now = Date.now();

      // Sample coherence history (roughly every second)
      if (now - lastCoherenceTimeRef.current >= 1000) {
        setCoherenceHistory((prev) => [...prev, coherence]);
        lastCoherenceTimeRef.current = now;
      }

      if (isActive) {
        // In flow state
        if (flowStateStartRef.current === null) {
          flowStateStartRef.current = now;
        }

        const streak = now - flowStateStartRef.current;
        setCurrentStreak(streak);

        // FIX: Use functional update to avoid stale closure bug
        setLongestStreak((prev) => {
          const newLongest = Math.max(prev, streak);
          longestStreakRef.current = newLongest;
          return newLongest;
        });
      } else {
        // Not in flow state
        if (flowStateStartRef.current !== null) {
          // Add time spent in flow state
          const timeSpent = now - flowStateStartRef.current;
          setFlowStateTime((prev) => {
            const newTotal = prev + timeSpent;
            flowStateTimeRef.current = newTotal;
            return newTotal;
          });
          flowStateStartRef.current = null;
        }
        setCurrentStreak(0);
      }
    },
    [isSessionActive]
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
    flowStateTime,
    longestStreak,
    currentStreak,
    coherenceHistory,

    // Session controls
    startSession,
    endSession,
    updateFlowState,

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
