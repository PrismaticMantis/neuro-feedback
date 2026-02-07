// React hook for session management

import { useState, useCallback, useRef, useEffect } from 'react';
import { storage, calculateSessionStats } from '../lib/storage';
import { buildSessionRecord, saveSessionRecord, getLastJourneyId } from '../lib/session-storage';
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
  coherenceTime: number;
  longestStreak: number;
  currentStreak: number;
  coherenceHistory: number[];

  // Session controls
  startSession: () => void;
  endSession: (audioCoherenceTimeMs?: number) => Session | null; // PART 2: Accept audio-based time
  updateCoherenceStatus: (isActive: boolean, coherence: number) => void;

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
  const [users, setUsers] = useState<User[]>(() => storage.getUsers() as User[]);

  // Session state
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [coherenceTime, setCoherenceTime] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [coherenceHistory, setCoherenceHistory] = useState<number[]>([]);

  // Session result
  const [lastSession, setLastSession] = useState<Session | null>(null);
  const [lastSessionStats, setLastSessionStats] = useState<SessionStats | null>(null);

  // Navigation
  const [screen, setScreen] = useState<AppScreen>('setup');

  // Refs for tracking
  const coherenceStartRef = useRef<number | null>(null);
  const lastCoherenceTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Refs to track current values for accurate endSession calculation
  const coherenceTimeRef = useRef<number>(0);
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
    // CRITICAL: Persist startTime immediately so it's not lost if app crashes
    // The in-progress session is stored in localStorage right away
    const journeyId = currentUser ? getLastJourneyId(currentUser.id) : undefined;
    const inProgress = storage.startInProgressSession(
      currentUser?.id || 'anonymous',
      journeyId || undefined
    );
    
    // Use the persisted startTime for local state
    const now = new Date(inProgress.startTime).getTime();
    setSessionStartTime(now);
    setSessionDuration(0);
    setCoherenceTime(0);
    setLongestStreak(0);
    setCurrentStreak(0);
    setCoherenceHistory([]);
    setIsSessionActive(true);
    coherenceStartRef.current = null;
    coherenceTimeRef.current = 0;
    longestStreakRef.current = 0;
    lastCoherenceTimeRef.current = now;
    setScreen('session');
    
    console.log('[useSession] Session started with persisted startTime:', inProgress.startTime);
  }, [currentUser]);

  const endSession = useCallback((
    audioCoherenceTimeMs?: number,
    ppgData?: { avgHR: number | null; avgHRV: number | null },
    recoveryPoints?: number | null,
  ) => {
    if (!isSessionActive || !currentUser) {
      setIsSessionActive(false);
      // Clean up any orphaned in-progress session
      storage.clearInProgressSession();
      return null;
    }

    const endTime = Date.now();
    
    // CRITICAL: Get startTime from persisted in-progress session (authoritative source)
    // This ensures we use the ACTUAL start time, not a potentially stale memory value
    const inProgressSession = storage.getInProgressSession();
    let actualStartTime: number;
    let startTimeIso: string;
    
    if (inProgressSession) {
      // Use the persisted start time (correct behavior)
      actualStartTime = new Date(inProgressSession.startTime).getTime();
      startTimeIso = inProgressSession.startTime;
      console.log('[useSession] Using persisted startTime:', startTimeIso);
    } else if (sessionStartTime) {
      // Fallback to memory (legacy - in case session started before this update)
      actualStartTime = sessionStartTime;
      startTimeIso = new Date(sessionStartTime).toISOString();
      console.warn('[useSession] No persisted startTime found, using memory value:', startTimeIso);
    } else {
      // No start time available - cannot save session
      console.error('[useSession] No start time available, cannot save session');
      setIsSessionActive(false);
      storage.clearInProgressSession();
      return null;
    }
    
    const duration = endTime - actualStartTime;

    // PART 2: Use audio-based coherence time if provided, otherwise fall back to meter-based
    let finalCoherenceTime: number;
    if (audioCoherenceTimeMs !== undefined) {
      // Use audio engine's tracking (based on coherence gain activation)
      finalCoherenceTime = audioCoherenceTimeMs;
      console.log('[useSession] Using audio-based coherence time:', {
        coherenceTimeMs: finalCoherenceTime,
        coherenceTimeSeconds: (finalCoherenceTime / 1000).toFixed(2),
        sessionDurationMs: duration,
        sessionDurationSeconds: (duration / 1000).toFixed(2),
        coherencePercent: duration > 0 ? ((finalCoherenceTime / duration) * 100).toFixed(1) : '0',
      });
    } else {
      // Fallback to meter-based tracking (legacy)
      finalCoherenceTime = coherenceTimeRef.current;
      if (coherenceStartRef.current !== null) {
        const finalTimeSpent = endTime - coherenceStartRef.current;
        finalCoherenceTime = coherenceTimeRef.current + finalTimeSpent;
      }
    }
    
    let finalLongestStreak = longestStreakRef.current;
    
    if (coherenceStartRef.current !== null) {
      // Update longest streak if this final period is longer
      const finalStreak = endTime - coherenceStartRef.current;
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
      startTime: startTimeIso, // Use the authoritative start time
      endTime: new Date(endTime).toISOString(),
      duration,
      coherenceTime: finalCoherenceTime,
      longestStreak: finalLongestStreak,
      avgCoherence,
      coherenceHistory,
      // PPG heart metrics (null if PPG data unavailable)
      avgHeartRate: ppgData?.avgHR ?? null,
      avgHRV: ppgData?.avgHRV ?? null,
      // Recovery points (null if not computed)
      recoveryPoints: recoveryPoints ?? null,
    });
    
    // Clear the in-progress session now that it's been saved
    storage.clearInProgressSession();

    const stats = calculateSessionStats(session);
    setLastSession(session);
    setLastSessionStats(stats);
    setIsSessionActive(false);
    setScreen('summary');

    // Auto-persist session to user profile (session history) so it is not lost
    const journeyId = getLastJourneyId(currentUser.id);
    const coherencePercent = duration > 0 ? (finalCoherenceTime / duration) * 100 : 0;
    // Build PPG summary for session record (if HR data available)
    const ppgSummary = ppgData?.avgHR != null
      ? { avgHR: ppgData.avgHR, avgHRV: ppgData.avgHRV, hrTrend: 'stable' as const }
      : undefined;

    const record = buildSessionRecord({
      id: session.id,
      userId: currentUser.id,
      journeyId,
      startTime: session.startTime,
      endTime: session.endTime,
      durationMs: duration,
      coherenceMs: finalCoherenceTime,
      coherencePercent,
      coherenceEntries: 0,
      longestStreakMs: finalLongestStreak,
      avgCoherence,
      achievementScore: stats.achievementScore,
      coherenceHistory,
      ppgSummary,
    });
    Promise.resolve(saveSessionRecord(record)).catch((e) => {
      console.warn('Failed to save session record', e);
    });

    return session;
  }, [
    isSessionActive,
    sessionStartTime,
    currentUser,
    coherenceHistory,
  ]);

  const updateCoherenceStatus = useCallback(
    (isActive: boolean, coherence: number) => {
      if (!isSessionActive) return;

      const now = Date.now();

      // Sample coherence history (roughly every second)
      if (now - lastCoherenceTimeRef.current >= 1000) {
        setCoherenceHistory((prev) => [...prev, coherence]);
        lastCoherenceTimeRef.current = now;
      }

      if (isActive) {
        // In coherence
        if (coherenceStartRef.current === null) {
          coherenceStartRef.current = now;
        }

        const streak = now - coherenceStartRef.current;
        setCurrentStreak(streak);

        // FIX: Use functional update to avoid stale closure bug
        setLongestStreak((prev) => {
          const newLongest = Math.max(prev, streak);
          longestStreakRef.current = newLongest;
          return newLongest;
        });
      } else {
        // Not in coherence
        if (coherenceStartRef.current !== null) {
          // Add time spent in coherence
          const timeSpent = now - coherenceStartRef.current;
          setCoherenceTime((prev) => {
            const newTotal = prev + timeSpent;
            coherenceTimeRef.current = newTotal;
            return newTotal;
          });
          coherenceStartRef.current = null;
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
    users: users as User[],
    createUser,
    selectUser,
    deleteUser,

    // Session state
    isSessionActive,
    sessionStartTime,
    sessionDuration,
    coherenceTime,
    longestStreak,
    currentStreak,
    coherenceHistory,

    // Session controls
    startSession,
    endSession,
    updateCoherenceStatus,

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
