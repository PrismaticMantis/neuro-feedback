// Vercel Serverless Function - Send session report via email
// Uses Resend for reliable email delivery

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface EmailPayload {
  email: string;
  sessionSummary: {
    date: string;
    time: string;
    duration: string;
    coherencePercent: number;
    longestStreak: string;
    avgCoherence: number;
    achievementScore: string;
    sessionId: string;
    timestamp: string;
  };
  timestamp: string;
  pdf?: string; // base64 encoded PDF
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[API] ===== EMAIL REQUEST RECEIVED =====');
  console.log('[API] Method:', req.method);
  console.log('[API] Headers:', JSON.stringify(req.headers, null, 2));

  try {
    const payload: EmailPayload = req.body;
    
    // Validate payload
    if (!payload.email) {
      console.error('[API] Missing email in payload');
      return res.status(400).json({ error: 'Email address is required' });
    }

    if (!payload.sessionSummary) {
      console.error('[API] Missing sessionSummary in payload');
      return res.status(400).json({ error: 'Session summary is required' });
    }

    console.log('[API] Email:', payload.email);
    console.log('[API] Session ID:', payload.sessionSummary.sessionId);
    console.log('[API] PDF provided:', !!payload.pdf);
    if (payload.pdf) {
      console.log('[API] PDF base64 length:', payload.pdf.length);
    }

    // Check if Resend API key is configured
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('[API] RESEND_API_KEY not configured');
      return res.status(503).json({ 
        error: 'Email service not configured. Please contact support or use PDF download instead.' 
      });
    }

    // Import Resend dynamically (only if API key exists)
    const { Resend } = await import('resend');
    const resend = new Resend(resendApiKey);

    // Prepare email content
    const emailBody = `
Neuro-Somatic Feedback Session Report

Date: ${payload.sessionSummary.date} at ${payload.sessionSummary.time}
Session Duration: ${payload.sessionSummary.duration}
Time in Coherence: ${payload.sessionSummary.coherencePercent}%
Longest Coherence Streak: ${payload.sessionSummary.longestStreak}
Average Coherence: ${payload.sessionSummary.avgCoherence.toFixed(2)}
Achievement: ${payload.sessionSummary.achievementScore}

Session ID: ${payload.sessionSummary.sessionId}
Generated: ${new Date(payload.sessionSummary.timestamp).toLocaleString()}
    `.trim();

    // Prepare email options
    const emailOptions: any = {
      from: process.env.RESEND_FROM_EMAIL || 'Neuro-Feedback <noreply@neurofeedback.app>',
      to: payload.email,
      subject: 'Your Neuro-Feedback Session Report',
      text: emailBody,
    };

    // Attach PDF if provided
    if (payload.pdf) {
      try {
        // Convert base64 to buffer
        const pdfBuffer = Buffer.from(payload.pdf, 'base64');
        console.log('[API] PDF buffer size:', pdfBuffer.length, 'bytes');
        
        // Check size limit (10MB)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (pdfBuffer.length > MAX_SIZE) {
          console.error('[API] PDF too large:', pdfBuffer.length, 'bytes');
          return res.status(413).json({ error: 'PDF attachment is too large (max 10MB)' });
        }

        emailOptions.attachments = [
          {
            filename: `session-report-${payload.sessionSummary.sessionId}.pdf`,
            content: pdfBuffer,
          },
        ];
        console.log('[API] PDF attachment added to email');
      } catch (error) {
        console.error('[API] Failed to process PDF attachment:', error);
        // Continue without attachment rather than failing completely
        console.warn('[API] Sending email without PDF attachment');
      }
    }

    console.log('[API] Sending email via Resend...');
    
    // Send email via Resend
    const result = await resend.emails.send(emailOptions);

    console.log('[API] Resend response:', JSON.stringify(result, null, 2));

    if (result.error) {
      console.error('[API] Resend API error:', result.error);
      return res.status(500).json({ 
        error: `Email service error: ${result.error.message || 'Unknown error'}` 
      });
    }

    console.log('[API] ✅ Email sent successfully');
    console.log('[API] Email ID:', result.data?.id);
    console.log('[API] ===== EMAIL REQUEST SUCCESS =====');

    return res.status(200).json({ 
      success: true,
      message: 'Email sent successfully',
      emailId: result.data?.id,
    });

  } catch (error) {
    console.error('[API] ===== EMAIL REQUEST ERROR =====');
    console.error('[API] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[API] Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[API] Error stack:', error.stack);
    }

    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}
