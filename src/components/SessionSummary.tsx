// Session Summary – Save + Share (native), no email

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import type { Session, SessionStats, User } from '../types';
import { formatTime } from '../lib/storage';
import { ENABLE_PDF_EXPORT } from '../lib/feature-flags';

interface SessionSummaryProps {
  session: Session;
  stats: SessionStats;
  user: User;
  onNewSession: () => void;
  onExportData: () => void;
  onSaveSession: () => void;
}

/**
 * Detect if running on iOS (iPhone/iPad)
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function SessionSummary({
  session,
  stats,
  user,
  onNewSession,
  onExportData,
  onSaveSession,
}: SessionSummaryProps) {
  const [saved, setSaved] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Draw mini graph
  const drawMiniGraph = (canvas: HTMLCanvasElement, history: number[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || history.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(223, 197, 139, 0.2)'); /* accent.primary with opacity */
    gradient.addColorStop(1, 'rgba(223, 197, 139, 0.02)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#dfc58b'; /* accent.primary - Champagne */
    ctx.lineWidth = 2;

    const pointSpacing = width / (history.length - 1);

    history.forEach((value, index) => {
      const x = index * pointSpacing;
      const y = height * (1 - value);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Fill area under line
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(223, 197, 139, 0.1)'; /* accent.primary with opacity */
    ctx.fill();
  };

  /**
   * Generate PDF as Blob
   */
  const generatePdfBlob = async (): Promise<Blob> => {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Title (champagne - SoundBed spec)
    pdf.setFontSize(24);
    pdf.setTextColor(223, 197, 139);
    pdf.text('Session Report', margin, y);
    y += 15;

    // User and date
    pdf.setFontSize(12);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`User: ${user.name}`, margin, y);
    y += 6;
    pdf.text(`Date: ${new Date(session.startTime).toLocaleDateString()}`, margin, y);
    y += 6;
    pdf.text(`Time: ${new Date(session.startTime).toLocaleTimeString()}`, margin, y);
    y += 15;

    // Main stat - Coherence percentage (champagne)
    pdf.setFontSize(48);
    pdf.setTextColor(223, 197, 139);
    pdf.text(`${Math.round(stats.coherencePercent)}%`, pageWidth / 2, y, { align: 'center' });
    y += 10;

    pdf.setFontSize(14);
    pdf.setTextColor(150, 150, 150);
    pdf.text('Time in Coherence', pageWidth / 2, y, { align: 'center' });
    y += 20;

    // Stats grid
    pdf.setFontSize(12);
    pdf.setTextColor(50, 50, 50);

    const statsData = [
      ['Total Length', formatTime(stats.totalLength) + ' min'],
      ['Longest Streak', formatTime(stats.longestStreak) + ' min'],
      ['Avg. Coherence', stats.avgCoherence.toFixed(2)],
      ['Achievement', stats.achievementScore],
    ];

    const colWidth = (pageWidth - margin * 2) / 2;

    statsData.forEach((stat, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + col * colWidth;
      const rowY = y + row * 15;

      pdf.setTextColor(100, 100, 100);
      pdf.text(stat[0], x, rowY);

      pdf.setFontSize(14);
      pdf.setTextColor(50, 50, 50);
      pdf.text(stat[1], x, rowY + 6);
      pdf.setFontSize(12);
    });

    y += 40;

    // Draw coherence graph
    if (session.coherenceHistory.length > 1) {
      pdf.setTextColor(100, 100, 100);
      pdf.text('Coherence Over Time', margin, y);
      y += 5;

      // Create a mini canvas for the graph
      const graphWidth = pageWidth - margin * 2;
      const graphHeight = 40;

      // Draw graph background
      pdf.setFillColor(240, 248, 248);
      pdf.rect(margin, y, graphWidth, graphHeight, 'F');

      // Draw coherence line
      const history = session.coherenceHistory;
      const pointSpacing = graphWidth / (history.length - 1);

      pdf.setDrawColor(79, 209, 197);
      pdf.setLineWidth(0.5);

      for (let i = 0; i < history.length - 1; i++) {
        const x1 = margin + i * pointSpacing;
        const y1 = y + graphHeight * (1 - history[i]);
        const x2 = margin + (i + 1) * pointSpacing;
        const y2 = y + graphHeight * (1 - history[i + 1]);

        pdf.line(x1, y1, x2, y2);
      }
    }

    // Footer
    pdf.setFontSize(10);
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      'Generated by Neuro-Somatic Feedback App',
      pageWidth / 2,
      pdf.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );

    // Convert to Blob using arraybuffer (more reliable cross-platform)
    const arrayBuffer = pdf.output('arraybuffer');
    return new Blob([arrayBuffer], { type: 'application/pdf' });
  };

  const handleSave = useCallback(() => {
    onSaveSession();
    setSaved(true);
  }, [onSaveSession]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    setShareError(null);
    const text = `Session Report – ${user.name}\n${new Date(session.startTime).toLocaleString()}\nDuration: ${formatTime(stats.totalLength)} min\nTime in Coherence: ${Math.round(stats.coherencePercent)}%\nLongest streak: ${formatTime(stats.longestStreak)} min\nAchievement: ${stats.achievementScore}`;

    try {
      let blob: Blob | null = null;
      if (ENABLE_PDF_EXPORT) {
        try {
          blob = await generatePdfBlob();
        } catch (_) { /* use text fallback */ }
      }

      if (navigator.share) {
        const payload: ShareData = { title: 'Session Report', text };
        if (blob) {
          const f = new File([blob], `session-report-${session.id}.pdf`, { type: 'application/pdf' });
          if (navigator.canShare && navigator.canShare({ files: [f] })) payload.files = [f];
        }
        await navigator.share(payload);
      } else if (blob && !isIOS()) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-report-${session.id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await navigator.clipboard.writeText(text);
        setShareError('Summary copied to clipboard.');
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setShareError((e as Error)?.message ?? 'Share failed');
    } finally {
      setIsSharing(false);
    }
  }, [session, stats, user]);

  // Draw mini graph on mount
  const handleGraphRef = (canvas: HTMLCanvasElement | null) => {
    if (canvas && session.coherenceHistory.length > 1) {
      // Small delay to ensure canvas is rendered
      setTimeout(() => drawMiniGraph(canvas, session.coherenceHistory), 100);
    }
  };

  return (
    <motion.div
      className="screen session-summary"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <header className="screen-header">
        <h1>Session Complete</h1>
      </header>

      <div className="summary-content">
        {/* Main Stat - Circular Progress */}
        <div className="main-stat">
          <svg className="progress-ring" viewBox="0 0 120 120">
            <circle
              className="progress-bg"
              cx="60"
              cy="60"
              r="54"
              fill="none"
              strokeWidth="8"
            />
            <motion.circle
              className="progress-fill"
              cx="60"
              cy="60"
              r="54"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={339.292}
              initial={{ strokeDashoffset: 339.292 }}
              animate={{
                strokeDashoffset: 339.292 * (1 - stats.coherencePercent / 100),
              }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </svg>
          <div className="main-stat-text">
            <motion.span
              className="percentage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {Math.round(stats.coherencePercent)}%
            </motion.span>
            <span className="label">Time in Coherence</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total Length</span>
            <span className="stat-value">{formatTime(stats.totalLength)} min</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Longest Streak</span>
            <span className="stat-value">{formatTime(stats.longestStreak)} min</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Avg. Coherence</span>
            <span className="stat-value">{stats.avgCoherence.toFixed(1)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Achievement Score</span>
            <span className="stat-value achievement">{stats.achievementScore}</span>
          </div>
        </div>

        {/* Mini Graph */}
        <div className="mini-graph-container">
          <canvas ref={handleGraphRef} className="mini-graph" />
        </div>
      </div>

      {/* Actions */}
      <footer className="screen-footer">
        {shareError && (
          <p className="footer-hint" style={{ color: 'var(--warning)' }}>{shareError}</p>
        )}
        <motion.button
          className="btn btn-primary btn-large"
          onClick={handleSave}
          disabled={saved}
          whileHover={saved ? {} : { scale: 1.02 }}
          whileTap={saved ? {} : { scale: 0.98 }}
        >
          {saved ? 'Saved' : 'Save Session'}
        </motion.button>
        <motion.button
          className="btn btn-secondary"
          onClick={handleShare}
          disabled={isSharing}
          whileHover={isSharing ? {} : { scale: 1.02 }}
          whileTap={isSharing ? {} : { scale: 0.98 }}
        >
          {isSharing ? 'Preparing…' : 'Share'}
        </motion.button>
        <div className="secondary-actions">
          <button className="btn btn-secondary" onClick={onExportData}>
            Export Data (JSON)
          </button>
          <button className="btn btn-text" onClick={onNewSession}>
            New Session
          </button>
        </div>
      </footer>
    </motion.div>
  );
}
