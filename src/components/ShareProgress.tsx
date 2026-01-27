// Share Progress Component - Email sharing for session reports

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Session, SessionStats } from '../types';

interface ShareProgressProps {
  session: Session;
  stats: SessionStats;
  onSendEmail: (email: string) => Promise<void>;
  onDownloadPdf: () => void;
  onCancel?: () => void;
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export function ShareProgress({
  onSendEmail,
  onDownloadPdf,
  onCancel,
}: ShareProgressProps) {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setEmailError(null);
    setError(null);
  };

  const handleSend = async () => {
    console.log('[ShareProgress] ===== HANDLE SEND CLICKED =====');
    console.log('[ShareProgress] Email input:', email);
    
    // Validate email
    if (!email.trim()) {
      console.log('[ShareProgress] Email validation failed: empty');
      setEmailError('Please enter your email address');
      return;
    }

    if (!isValidEmail(email)) {
      console.log('[ShareProgress] Email validation failed: invalid format');
      setEmailError('Please enter a valid email address');
      return;
    }

    console.log('[ShareProgress] Email validated successfully');
    setIsSending(true);
    setError(null);
    setEmailError(null);

    try {
      console.log('[ShareProgress] Calling onSendEmail handler...');
      await onSendEmail(email.trim());
      console.log('[ShareProgress] ✅ Email send completed successfully');
      setIsSuccess(true);
    } catch (err) {
      console.error('[ShareProgress] ===== EMAIL SEND ERROR =====');
      console.error('[ShareProgress] Error:', err);
      console.error('[ShareProgress] Error type:', err instanceof Error ? err.constructor.name : typeof err);
      if (err instanceof Error) {
        console.error('[ShareProgress] Error message:', err.message);
        console.error('[ShareProgress] Error stack:', err.stack);
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to send email. Please try again.';
      setError(errorMessage);
    } finally {
      setIsSending(false);
      console.log('[ShareProgress] ===== HANDLE SEND COMPLETE =====');
    }
  };

  const handleDownloadPdf = () => {
    onDownloadPdf();
  };

  if (isSuccess) {
    return (
      <motion.div
        className="share-progress-modal"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div className="share-progress-content">
          <div className="share-progress-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h2>Sent!</h2>
            <p>Email sent to <strong>{email}</strong>. Check your inbox for your session report.</p>
            {onCancel && (
              <button className="btn btn-text" onClick={onCancel} style={{ marginTop: '1rem' }}>
                Close
              </button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="share-progress-modal"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="share-progress-content">
        <header className="share-progress-header">
          <h2>Save your training progress</h2>
          <p>Enter your email to receive this session report and keep your progress.</p>
        </header>

        <div className="share-progress-form">
          <div className="form-group">
            <label htmlFor="email-input">Email address</label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="your.email@example.com"
              disabled={isSending}
              className={emailError ? 'error' : ''}
              autoComplete="email"
              autoFocus
            />
            {emailError && <span className="form-error">{emailError}</span>}
          </div>

          {error && (
            <div className="share-progress-error">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="share-progress-actions">
            <motion.button
              className="btn btn-primary btn-large"
              onClick={handleSend}
              disabled={isSending || !email.trim()}
              whileHover={isSending ? {} : { scale: 1.02 }}
              whileTap={isSending ? {} : { scale: 0.98 }}
            >
              {isSending ? (
                <>
                  <svg className="spinner" viewBox="0 0 24 24" width="20" height="20">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31.416" strokeDashoffset="31.416">
                      <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite" />
                      <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite" />
                    </circle>
                  </svg>
                  Sending...
                </>
              ) : (
                'Send training progress'
              )}
            </motion.button>

            <button
              className="btn btn-secondary"
              onClick={handleDownloadPdf}
              disabled={isSending}
            >
              Download PDF instead
            </button>

            {onCancel && (
              <button
                className="btn btn-text"
                onClick={onCancel}
                disabled={isSending}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
