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
  console.log('[EmailService] ===== EMAIL SEND START =====');
  console.log('[EmailService] Button click handler fired');
  console.log('[EmailService] Email validated:', email);
  
  const apiUrl = getReportsApiUrl();
  const summary = formatSessionSummaryData(session, stats);

  console.log('[EmailService] API URL:', apiUrl);
  console.log('[EmailService] Session summary prepared:', {
    sessionId: summary.sessionId,
    coherencePercent: summary.coherencePercent,
    duration: summary.duration,
  });

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
    console.log('[EmailService] PDF blob provided, size:', pdfBlob.size, 'bytes');
    
    // Check file size limit (10MB for email attachments)
    const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
    if (pdfBlob.size > MAX_PDF_SIZE) {
      const errorMsg = `PDF is too large (${Math.round(pdfBlob.size / 1024 / 1024)}MB). Maximum size is 10MB.`;
      console.error('[EmailService] PDF size check failed:', errorMsg);
      throw new Error(errorMsg);
    }
    
    try {
      console.log('[EmailService] Converting PDF to base64...');
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Convert to base64 safely (handle large files)
      let binary = '';
      const len = bytes.byteLength;
      const chunkSize = 8192; // Process in chunks to avoid blocking
      
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      
      payload.pdf = btoa(binary);
      console.log('[EmailService] PDF converted to base64, length:', payload.pdf.length);
    } catch (error) {
      console.error('[EmailService] PDF conversion failed:', error);
      throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    console.log('[EmailService] No PDF blob provided - sending email without attachment');
  }

  console.log('[EmailService] Payload created, size:', JSON.stringify(payload).length, 'bytes');
  console.log('[EmailService] Sending request to:', apiUrl);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('[EmailService] Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      let errorText: string;
      try {
        errorText = await response.text();
        console.error('[EmailService] Error response body:', errorText);
      } catch {
        errorText = `HTTP ${response.status} ${response.statusText}`;
      }
      
      // Provide user-friendly error messages
      let userMessage: string;
      if (response.status === 404) {
        userMessage = 'Email service not configured. Please contact support or use PDF download instead.';
      } else if (response.status === 413) {
        userMessage = 'PDF is too large. Please try downloading the PDF instead.';
      } else if (response.status >= 500) {
        userMessage = 'Email service temporarily unavailable. Please try again later or download the PDF.';
      } else {
        userMessage = `Failed to send email: ${errorText}`;
      }
      
      throw new Error(userMessage);
    }

    // Try to parse response body for additional info
    try {
      const responseData = await response.json();
      console.log('[EmailService] Response data:', responseData);
    } catch {
      // Response might not be JSON, that's okay
      console.log('[EmailService] Response is not JSON (that\'s okay)');
    }

    console.log('[EmailService] ✅ Email sent successfully via backend');
    console.log('[EmailService] ===== EMAIL SEND SUCCESS =====');
  } catch (error) {
    console.error('[EmailService] ===== EMAIL SEND FAILED =====');
    console.error('[EmailService] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[EmailService] Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[EmailService] Error stack:', error.stack);
    }
    
    // Re-throw with user-friendly message
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to send email. Please check your connection and try again.');
  }
}

/**
 * Send email via mailto: (frontend fallback)
 * NOTE: This does NOT actually send emails - it only opens the user's email client
 */
export function sendEmailViaMailto(
  email: string,
  session: Session,
  stats: SessionStats
): void {
  console.log('[EmailService] ===== MAILTO FALLBACK =====');
  console.log('[EmailService] Using mailto: fallback (email client will open)');
  console.log('[EmailService] Email:', email);
  
  const summary = formatSessionSummaryData(session, stats);
  const subject = encodeURIComponent('Your Neuro-Feedback Session Report');
  const body = encodeURIComponent(formatEmailBody(summary));
  
  const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
  
  console.log('[EmailService] Mailto URL created (length:', mailtoUrl.length, ')');
  console.log('[EmailService] Opening mailto: link...');
  
  try {
    // Open mailto: link (works on iOS)
    window.location.href = mailtoUrl;
    console.log('[EmailService] Mailto link opened successfully');
    console.log('[EmailService] NOTE: User must manually send email from their email client');
  } catch (error) {
    console.error('[EmailService] Failed to open mailto link:', error);
    throw new Error('Failed to open email client. Please check your email settings.');
  }
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
  console.log('[EmailService] ===== SEND SESSION REPORT EMAIL =====');
  console.log('[EmailService] Email:', email);
  console.log('[EmailService] Session ID:', session.id);
  console.log('[EmailService] PDF blob provided:', !!pdfBlob);
  if (pdfBlob) {
    console.log('[EmailService] PDF blob size:', pdfBlob.size, 'bytes');
  }
  
  const backendEnabled = isBackendEmailEnabled();
  console.log('[EmailService] Backend email enabled:', backendEnabled);
  
  if (backendEnabled) {
    // Use backend API
    console.log('[EmailService] Using backend API path');
    await sendEmailViaBackend(email, session, stats, pdfBlob);
  } else {
    // Use mailto: fallback
    console.log('[EmailService] Using mailto: fallback path');
    console.log('[EmailService] WARNING: mailto: does not actually send emails - it only opens email client');
    sendEmailViaMailto(email, session, stats);
    // mailto: is synchronous, but we return a resolved promise for consistency
    return Promise.resolve();
  }
}
