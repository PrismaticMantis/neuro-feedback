// Session Summary Screen Component with PDF Export

import { useState } from 'react';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import type { Session, SessionStats, User } from '../types';
import { formatTime } from '../lib/storage';

interface SessionSummaryProps {
  session: Session;
  stats: SessionStats;
  user: User;
  onNewSession: () => void;
  onExportData: () => void;
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
}: SessionSummaryProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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
    gradient.addColorStop(0, 'rgba(79, 209, 197, 0.2)');
    gradient.addColorStop(1, 'rgba(79, 209, 197, 0.02)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#4fd1c5';
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
    ctx.fillStyle = 'rgba(79, 209, 197, 0.1)';
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

    // Title
    pdf.setFontSize(24);
    pdf.setTextColor(79, 209, 197);
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

    // Main stat - Flow State percentage
    pdf.setFontSize(48);
    pdf.setTextColor(79, 209, 197);
    pdf.text(`${Math.round(stats.flowStatePercent)}%`, pageWidth / 2, y, { align: 'center' });
    y += 10;

    pdf.setFontSize(14);
    pdf.setTextColor(150, 150, 150);
    pdf.text('Time in Flow State', pageWidth / 2, y, { align: 'center' });
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

  /**
   * Open PDF in browser for iOS (use same tab)
   */
  const openPdfForIos = (blob: Blob): void => {
    const url = URL.createObjectURL(blob);
    // Navigate directly to blob URL in same tab (iOS-friendly)
    window.location.href = url;
    // Revoke URL after navigation
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);
  };

  /**
   * Download PDF for desktop browsers
   */
  const downloadPdfForDesktop = (blob: Blob): void => {
    const url = URL.createObjectURL(blob);
    const filename = `session-report-${new Date().toISOString().split('T')[0]}.pdf`;
    
    // Create temporary anchor element
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  };

  /**
   * Export PDF report handler
   */
  const exportPDF = async () => {
    setIsGeneratingPdf(true);
    setPdfError(null);

    try {
      // Generate PDF (async)
      const blob = await generatePdfBlob();

      // Handle based on platform
      const isIOSDevice = isIOS();
      if (isIOSDevice) {
        // iOS: Open in same tab
        openPdfForIos(blob);
      } else {
        // Desktop: Download file
        downloadPdfForDesktop(blob);
      }
    } catch (error) {
      console.error('[SessionSummary] PDF export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setPdfError(errorMessage);
      
      // Show error for a few seconds
      setTimeout(() => {
        setPdfError(null);
      }, 5000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

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
                strokeDashoffset: 339.292 * (1 - stats.flowStatePercent / 100),
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
              {Math.round(stats.flowStatePercent)}%
            </motion.span>
            <span className="label">Time in Flow State</span>
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
        {pdfError && (
          <div className="pdf-error-toast">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span>Failed to export PDF: {pdfError}</span>
          </div>
        )}
        <motion.button
          className="btn btn-primary btn-large"
          onClick={exportPDF}
          disabled={isGeneratingPdf}
          whileHover={isGeneratingPdf ? {} : { scale: 1.02 }}
          whileTap={isGeneratingPdf ? {} : { scale: 0.98 }}
        >
          {isGeneratingPdf ? (
            <>
              <svg className="spinner" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31.416" strokeDashoffset="31.416">
                  <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite" />
                  <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite" />
                </circle>
              </svg>
              Generating PDF...
            </>
          ) : (
            'Export PDF Report'
          )}
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
