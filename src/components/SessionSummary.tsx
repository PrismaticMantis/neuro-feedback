// UI reference: design/targets/6 - Summary.png

import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import type { Session, SessionStats, User } from '../types';
import { getJourneys, getLastJourneyId } from '../lib/session-storage';
import { formatTime } from '../lib/storage';
import { generateSummaryPdfBlob } from '../lib/summary-pdf';

interface SessionSummaryProps {
  session: Session;
  stats: SessionStats;
  user: User;
  onNewSession: () => void;
  onExportData?: () => void;
  onSaveSession?: () => void;
}

export function SessionSummary({
  session,
  stats,
  user,
  onNewSession,
  onSaveSession,
}: SessionSummaryProps) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Get journey name from journeyId
  const journeyId = getLastJourneyId(user.id);
  const journeys = getJourneys();
  const journey = journeys.find(j => j.id === journeyId) || journeys[0];
  const journeyName = journey.name;

  // Calculate peak coherence from history
  const peakCoherence = useMemo(() => {
    if (session.coherenceHistory.length === 0) return 0;
    return Math.max(...session.coherenceHistory);
  }, [session.coherenceHistory]);

  // Derive stability from achievement score
  const stability = useMemo(() => {
    const score = stats.achievementScore;
    if (score === 'Mastery' || score === 'Flowing') return 'High';
    if (score === 'Settled') return 'Medium';
    return 'Low';
  }, [stats.achievementScore]);

  const stabilitySubtext = useMemo(() => {
    const score = stats.achievementScore;
    if (score === 'Mastery' || score === 'Flowing') return 'Minimal variance';
    if (score === 'Settled') return 'Moderate variance';
    return 'Variable';
  }, [stats.achievementScore]);

  // Session interpretation based on coherence percent and peak
  const sessionInterpretation = useMemo(() => {
    const percent = stats.coherencePercent;
    const peak = Math.round(peakCoherence * 100);
    if (percent >= 70) {
      return `Excellent session. Your coherence peaked at ${peak}% and maintained high stability throughout the journey.`;
    }
    if (percent >= 50) {
      return `Strong coherence maintained. Your coherence peaked at ${peak}% during this session.`;
    }
    if (percent >= 30) {
      return `Good progress toward coherence. Peak coherence reached ${peak}%.`;
    }
    return `Building coherence foundation. Peak coherence was ${peak}%.`;
  }, [stats.coherencePercent, peakCoherence]);

  const handleSave = useCallback(() => {
    if (onSaveSession) {
      onSaveSession();
      setSaved(true);
    }
  }, [onSaveSession]);

  /** Generate PDF and return blob for share/email */
  const getPdfBlob = useCallback(async (): Promise<Blob> => {
    return generateSummaryPdfBlob({
      session,
      stats,
      user,
      journeyName,
      peakCoherence,
      stability,
      avgHeartRate: null,
      avgHRV: null,
    });
  }, [session, stats, user, journeyName, peakCoherence, stability]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const pdfBlob = await getPdfBlob();
      const file = new File(
        [pdfBlob],
        `SoundBed-Session-${new Date(session.startTime).toISOString().slice(0, 10)}.pdf`,
        { type: 'application/pdf' }
      );
      const text = `Session Report – ${user.name}\n${new Date(session.startTime).toLocaleString()}\nDuration: ${formatTime(stats.totalLength)} min\nCoherence: ${Math.round(stats.coherencePercent)}%\nPeak: ${Math.round(peakCoherence * 100)}%\nStability: ${stability}`;
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'SoundBed Session Summary', text, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: 'SoundBed Session Summary', text });
      } else {
        await navigator.clipboard.writeText(text);
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        console.error('Share failed:', e);
      }
    } finally {
      setIsSharing(false);
    }
  }, [session, stats, user, peakCoherence, stability, getPdfBlob]);

  /** Email: exact SoundBed copy + open mailto; trigger PDF download so user can attach */
  const handleEmail = useCallback(async () => {
    setIsSharing(true);
    try {
      const pdfBlob = await getPdfBlob();
      const fileName = `SoundBed-Session-${new Date(session.startTime).toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const firstName = user.name.trim().split(/\s+/)[0] || user.name;
      const subject = encodeURIComponent('Your Nervous System Just Learned Something');
      const body = encodeURIComponent(
        `Hi ${firstName}, this is a snapshot of your most recent SoundBed session. Take a moment to feel into it. Your body remembers. Small shifts compound. Keep training.\n\n(Attach the downloaded PDF: ${fileName})`
      );
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    } catch (e) {
      console.error('Email/PDF failed:', e);
    } finally {
      setIsSharing(false);
    }
  }, [session, user, getPdfBlob]);

  // Draw timeline graph with gradient and axis labels
  const drawTimelineGraph = (canvas: HTMLCanvasElement, history: number[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || history.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const paddingTop = 20;
    const paddingBottom = 25;
    const paddingLeft = 40;
    const paddingRight = 10;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw Y-axis labels
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '11px Inter';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yLabels = ['100%', '75%', '50%', '25%', '0%'];
    yLabels.forEach((label, i) => {
      const y = paddingTop + (chartHeight / 4) * i;
      ctx.fillText(label, paddingLeft - 8, y);
    });

    // Draw X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const durationMinutes = Math.ceil(session.duration / 60000);
    const xLabelCount = 5;
    for (let i = 0; i < xLabelCount; i++) {
      const minutes = Math.round((durationMinutes / (xLabelCount - 1)) * i);
      const x = paddingLeft + (chartWidth / (xLabelCount - 1)) * i;
      const timeStr = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
      ctx.fillText(timeStr, x, height - paddingBottom + 8);
    }

    // Draw chart area
    const chartX = paddingLeft;
    const chartY = paddingTop;

    // Background
    ctx.fillStyle = 'var(--bg-card)';
    ctx.fillRect(chartX, chartY, chartWidth, chartHeight);

    // Draw line with gradient (purple to gold)
    ctx.beginPath();
    const pointSpacing = chartWidth / (history.length - 1);

    history.forEach((value, index) => {
      const x = chartX + index * pointSpacing;
      const y = chartY + chartHeight * (1 - value);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    // Create gradient for stroke
    const gradient = ctx.createLinearGradient(chartX, 0, chartX + chartWidth, 0);
    gradient.addColorStop(0, '#9e59b8'); // Purple (accent-secondary)
    gradient.addColorStop(1, '#dfc58b'); // Gold (accent-primary)
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Fill area under line with matching gradient
    ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.closePath();

    // Create fill gradient
    const fillGradient = ctx.createLinearGradient(chartX, 0, chartX + chartWidth, 0);
    fillGradient.addColorStop(0, 'rgba(158, 89, 184, 0.3)'); // Purple with opacity
    fillGradient.addColorStop(1, 'rgba(223, 197, 139, 0.2)'); // Gold with opacity
    ctx.fillStyle = fillGradient;
    ctx.fill();
  };

  // Removed PDF/share functionality - presentation-only refactor per requirements
  // Keeping these functions commented for potential future use
  /*
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

    const arrayBuffer = pdf.output('arraybuffer');
    return new Blob([arrayBuffer], { type: 'application/pdf' });
  };
  */

  // Draw timeline graph on mount
  const handleGraphRef = (canvas: HTMLCanvasElement | null) => {
    if (canvas && session.coherenceHistory.length > 1) {
      // Small delay to ensure canvas is rendered
      setTimeout(() => drawTimelineGraph(canvas, session.coherenceHistory), 100);
    }
  };

  return (
    <motion.div
      className="screen session-summary"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Top Navigation Bar */}
      <header className="summary-header">
        <Link to="/home" className="summary-back-btn" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </Link>
        <div className="summary-header-actions">
          <button
            className="summary-action-btn"
            onClick={handleSave}
            disabled={saved}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            <span>Save</span>
          </button>
          <button
            className="summary-action-btn"
            onClick={handleShare}
            disabled={isSharing}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            <span>Share</span>
          </button>
          <button
            className="summary-action-btn"
            onClick={handleEmail}
            disabled={isSharing}
            title="Email summary (opens mail app; PDF downloads for attachment)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>Email</span>
          </button>
        </div>
      </header>

      <div className="summary-content">
        {/* Hero Section - Circular Coherence Ring */}
        <div className="summary-hero">
          <p className="summary-complete-label">Session Complete</p>
          <h2 className="summary-journey-name">{journeyName}</h2>
          <div className="summary-coherence-ring">
            <svg className="coherence-ring-svg" viewBox="0 0 200 200">
              <circle
                className="coherence-ring-bg"
                cx="100"
                cy="100"
                r="85"
                fill="none"
                strokeWidth="10"
              />
              <motion.circle
                className="coherence-ring-fill"
                cx="100"
                cy="100"
                r="85"
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={534.07}
                initial={{ strokeDashoffset: 534.07 }}
                animate={{
                  strokeDashoffset: 534.07 * (1 - stats.coherencePercent / 100),
                }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
              />
            </svg>
            <div className="coherence-ring-center">
              <motion.span
                className="coherence-percentage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {Math.round(stats.coherencePercent)}
              </motion.span>
              <span className="coherence-label">Coherence</span>
            </div>
          </div>
          <p className="summary-interpretation">{sessionInterpretation}</p>
        </div>

        {/* Session Metrics Section */}
        <div className="summary-metrics-section">
          <h3 className="summary-section-title">Session Metrics</h3>
          <div className="summary-metrics-grid">
            <div className="summary-metric-card">
              <span className="summary-metric-label">Duration</span>
              <span className="summary-metric-value">{formatTime(stats.totalLength)} min</span>
            </div>
            <div className="summary-metric-card">
              <span className="summary-metric-label">Avg. Coherence</span>
              <span className="summary-metric-value">
                {Math.round(stats.avgCoherence * 100)}%
                <svg className="summary-up-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/>
                  <polyline points="5 12 12 5 19 12"/>
                </svg>
              </span>
            </div>
            <div className="summary-metric-card">
              <span className="summary-metric-label">Peak Coherence</span>
              <span className="summary-metric-value">{Math.round(peakCoherence * 100)} %</span>
            </div>
            <div className="summary-metric-card">
              <span className="summary-metric-label">Stability</span>
              <span className="summary-metric-value">{stability}</span>
              <span className="summary-metric-subtext">{stabilitySubtext}</span>
            </div>
          </div>
        </div>

        {/* Coherence Timeline */}
        <div className="summary-timeline-section">
          <h3 className="summary-section-title">Coherence Timeline</h3>
          <div className="summary-timeline-chart">
            <canvas ref={handleGraphRef} className="summary-timeline-canvas" />
          </div>
        </div>
      </div>

      {/* CTA Buttons */}
      <footer className="summary-footer">
        <motion.button
          className="btn btn-secondary btn-large"
          onClick={() => navigate('/home')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Back to Home
        </motion.button>
        <motion.button
          className="btn btn-primary btn-large"
          onClick={onNewSession}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Start Another Journey
        </motion.button>
      </footer>
    </motion.div>
  );
}
