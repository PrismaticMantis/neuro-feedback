// Email Service - Handles sending session reports via email
// Supports both mailto: fallback and backend API

import type { Session, SessionStats } from '../types';
import { formatTime } from './storage';

export interface SessionSummaryData {
  date: string;
  time: string;
  duration: string;
  coherencePercent: number;
  longestStreak: string;
  avgCoherence: number;
  achievementScore: string;
  sessionId: string;
  timestamp: string;
}

/**
 * Format session data for email/API
 */
export function formatSessionSummaryData(
  session: Session,
  stats: SessionStats
): SessionSummaryData {
  const date = new Date(session.startTime);
  
  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString(),
    duration: formatTime(stats.totalLength) + ' minutes',
    coherencePercent: Math.round(stats.coherencePercent),
    longestStreak: formatTime(stats.longestStreak) + ' minutes',
    avgCoherence: stats.avgCoherence,
    achievementScore: stats.achievementScore,
    sessionId: session.id,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format email body text
 */
export function formatEmailBody(summary: SessionSummaryData): string {
  return `Neuro-Somatic Feedback Session Report

Date: ${summary.date} at ${summary.time}
Session Duration: ${summary.duration}
Time in Coherence: ${summary.coherencePercent}%
Longest Coherence Streak: ${summary.longestStreak}
Average Coherence: ${summary.avgCoherence.toFixed(2)}
Achievement: ${summary.achievementScore}

Note: You can attach the downloaded PDF from your device if desired.`;
}

/**
 * Check if backend email API is enabled
 */
export function isBackendEmailEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_EMAIL_REPORTS === 'true';
}

/**
 * Get backend API URL
 */
export function getReportsApiUrl(): string {
  return import.meta.env.VITE_REPORTS_API_URL || '/api/send-report';
}

/**
 * Send email via backend API
 */
export async function sendEmailViaBackend(
  email: string,
  session: Session,
  stats: SessionStats,
  pdfBlob?: Blob
): Promise<void> {
  const apiUrl = getReportsApiUrl();
  const summary = formatSessionSummaryData(session, stats);

  // Prepare payload
  const payload: {
    email: string;
    sessionSummary: SessionSummaryData;
    timestamp: string;
    pdf?: string; // base64 encoded PDF
  } = {
    email,
    sessionSummary: summary,
    timestamp: new Date().toISOString(),
  };

  // Optionally include PDF as base64
  if (pdfBlob) {
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Convert to base64 safely (handle large files)
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    payload.pdf = btoa(binary);
  }

  console.log('[EmailService] Sending email via backend API', { apiUrl, email });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend API error: ${response.status} ${errorText}`);
  }

  console.log('[EmailService] Email sent successfully via backend');
}

/**
 * Send email via mailto: (frontend fallback)
 */
export function sendEmailViaMailto(
  email: string,
  session: Session,
  stats: SessionStats
): void {
  const summary = formatSessionSummaryData(session, stats);
  const subject = encodeURIComponent('Your Neuro-Feedback Session Report');
  const body = encodeURIComponent(formatEmailBody(summary));
  
  const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
  
  console.log('[EmailService] Opening mailto: link', { email });
  
  // Open mailto: link (works on iOS)
  window.location.href = mailtoUrl;
}

/**
 * Main function to send email (chooses backend or mailto:)
 */
export async function sendSessionReportEmail(
  email: string,
  session: Session,
  stats: SessionStats,
  pdfBlob?: Blob
): Promise<void> {
  if (isBackendEmailEnabled()) {
    // Use backend API
    await sendEmailViaBackend(email, session, stats, pdfBlob);
  } else {
    // Use mailto: fallback
    sendEmailViaMailto(email, session, stats);
    // mailto: is synchronous, but we return a resolved promise for consistency
    return Promise.resolve();
  }
}
