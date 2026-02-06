// UI reference: design/targets/6 - Summary.png
// Design tokens: docs/design-specification.md
// - Card (Glass): background linear-gradient with blur, 12px border-radius
// - Typography: Inter font family, various weights
// - Colors: #D9C478 (accent gold), various HSL backgrounds

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
      style={{
        padding: '0 24px 100px',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      {/* Top Navigation Bar - Target 6: Back arrow left, Save/Share buttons right */}
      <header 
        className="summary-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 0 24px',
        }}
      >
        <Link 
          to="/home" 
          className="summary-back-btn" 
          aria-label="Back"
          style={{
            padding: '8px',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </Link>
        <div 
          className="summary-header-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            className="summary-action-btn"
            onClick={handleSave}
            disabled={saved}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'hsl(270 10% 18% / 0.8)',
              border: '1px solid hsl(270 10% 25%)',
              borderRadius: '8px',
              color: saved ? 'var(--text-muted)' : 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: saved ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
          <button
            className="summary-action-btn"
            onClick={handleShare}
            disabled={isSharing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'hsl(270 10% 18% / 0.8)',
              border: '1px solid hsl(270 10% 25%)',
              borderRadius: '8px',
              color: isSharing ? 'var(--text-muted)' : 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: isSharing ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            <span>Share</span>
          </button>
        </div>
      </header>

      <div className="summary-content">
        {/* Hero Section - Target 6: Glass card with coherence ring */}
        <div 
          className="summary-hero"
          style={{
            background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
            border: '1px solid hsl(270 10% 25% / 0.3)',
            borderRadius: '12px',
            padding: '32px 24px',
            backdropFilter: 'blur(20px)',
            textAlign: 'center',
            marginBottom: '24px',
          }}
        >
          <p 
            className="summary-complete-label"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              margin: '0 0 8px',
              letterSpacing: '0.02em',
            }}
          >Session Complete</p>
          <h2 
            className="summary-journey-name"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '28px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 24px',
              lineHeight: 1.2,
            }}
          >{journeyName}</h2>
          
          {/* Coherence Ring - Gold stroke with pulsing glow */}
          <motion.div 
            className="summary-coherence-ring glow-icon"
            style={{
              position: 'relative',
              width: '160px',
              height: '160px',
              margin: '0 auto 24px',
              borderRadius: '50%',
            }}
            animate={{
              boxShadow: [
                '0 0 25px hsl(45 55% 70% / 0.15)',
                '0 0 45px hsl(45 55% 70% / 0.3)',
                '0 0 25px hsl(45 55% 70% / 0.15)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg 
              className="coherence-ring-svg" 
              viewBox="0 0 200 200"
              style={{
                width: '100%',
                height: '100%',
                transform: 'rotate(-90deg)',
              }}
            >
              {/* Glow filter for the ring */}
              <defs>
                <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle
                className="coherence-ring-bg"
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="hsl(270 10% 20%)"
                strokeWidth="8"
              />
              <motion.circle
                className="coherence-ring-fill"
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="#D9C478"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={534.07}
                initial={{ strokeDashoffset: 534.07 }}
                animate={{
                  strokeDashoffset: 534.07 * (1 - stats.coherencePercent / 100),
                }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                filter="url(#ring-glow)"
              />
            </svg>
            <div 
              className="coherence-ring-center"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <motion.span
                className="coherence-percentage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '44px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  lineHeight: 1,
                }}
              >
                {Math.round(stats.coherencePercent)}
              </motion.span>
              <span 
                className="coherence-label"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                }}
              >Coherence</span>
            </div>
          </motion.div>
          <p 
            className="summary-interpretation"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              margin: 0,
              lineHeight: 1.5,
              maxWidth: '400px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >{sessionInterpretation}</p>
        </div>

        {/* Session Metrics Section - Target 6: 4-card grid */}
        <div 
          className="summary-metrics-section"
          style={{
            marginBottom: '24px',
          }}
        >
          <h3 
            className="summary-section-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 16px',
            }}
          >Session Metrics</h3>
          <div 
            className="summary-metrics-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
            }}
          >
            {/* Duration Card */}
            <div 
              className="summary-metric-card"
              style={{
                background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
                border: '1px solid hsl(270 10% 25% / 0.3)',
                borderRadius: '12px',
                padding: '16px',
                backdropFilter: 'blur(20px)',
              }}
            >
              <span 
                className="summary-metric-label"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                }}
              >Duration</span>
              <span 
                className="summary-metric-value"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {formatTime(stats.totalLength)}
                <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px' }}>min</span>
              </span>
            </div>
            
            {/* Avg Coherence Card */}
            <div 
              className="summary-metric-card"
              style={{
                background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
                border: '1px solid hsl(270 10% 25% / 0.3)',
                borderRadius: '12px',
                padding: '16px',
                backdropFilter: 'blur(20px)',
              }}
            >
              <span 
                className="summary-metric-label"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                }}
              >Avg. Coherence</span>
              <span 
                className="summary-metric-value"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {Math.round(stats.avgCoherence * 100)}
                <span style={{ fontSize: '14px', fontWeight: 400 }}>%</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/>
                  <polyline points="5 12 12 5 19 12"/>
                </svg>
              </span>
            </div>
            
            {/* Peak Coherence Card */}
            <div 
              className="summary-metric-card"
              style={{
                background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
                border: '1px solid hsl(270 10% 25% / 0.3)',
                borderRadius: '12px',
                padding: '16px',
                backdropFilter: 'blur(20px)',
              }}
            >
              <span 
                className="summary-metric-label"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                }}
              >Peak Coherence</span>
              <span 
                className="summary-metric-value"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {Math.round(peakCoherence * 100)}
                <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px' }}>%</span>
              </span>
            </div>
            
            {/* Stability Card */}
            <div 
              className="summary-metric-card"
              style={{
                background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
                border: '1px solid hsl(270 10% 25% / 0.3)',
                borderRadius: '12px',
                padding: '16px',
                backdropFilter: 'blur(20px)',
              }}
            >
              <span 
                className="summary-metric-label"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                }}
              >Stability</span>
              <span 
                className="summary-metric-value"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >{stability}</span>
              <span 
                className="summary-metric-subtext"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                }}
              >{stabilitySubtext}</span>
            </div>
          </div>
        </div>

        {/* Coherence Timeline - Target 6: Graph card */}
        <div 
          className="summary-timeline-section"
          style={{
            marginBottom: '24px',
          }}
        >
          <h3 
            className="summary-section-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 16px',
            }}
          >Coherence Timeline</h3>
          <div 
            className="summary-timeline-chart"
            style={{
              background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
              border: '1px solid hsl(270 10% 25% / 0.3)',
              borderRadius: '12px',
              padding: '16px',
              backdropFilter: 'blur(20px)',
              height: '200px',
            }}
          >
            <canvas 
              ref={handleGraphRef} 
              className="summary-timeline-canvas"
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          </div>
        </div>

        {/* Body Rhythm Section - Target 6: 3-card grid (conditional - only shown if data exists) */}
        {((session as any).avgHeartRate !== undefined || (session as any).avgHRV !== undefined || (session as any).recoveryPoints !== undefined) && (
          <div 
            className="summary-body-rhythm-section"
            style={{
              marginBottom: '24px',
            }}
          >
            <h3 
              className="summary-section-title"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: '0 0 16px',
              }}
            >Body Rhythm</h3>
            <div 
              className="summary-body-rhythm-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
              }}
            >
              {/* Heart Rate Card */}
              {(session as any).avgHeartRate !== undefined && (
                <div 
                  className="summary-body-rhythm-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
                    border: '1px solid hsl(270 10% 25% / 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'hsl(350 70% 45% / 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 400,
                      color: 'var(--text-muted)',
                    }}>Heart Rate</span>
                    <span style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '18px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}>
                      {(session as any).avgHeartRate || 0}
                      <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '4px' }}>bpm</span>
                    </span>
                  </div>
                </div>
              )}
              
              {/* HRV Card */}
              {(session as any).avgHRV !== undefined && (
                <div 
                  className="summary-body-rhythm-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
                    border: '1px solid hsl(270 10% 25% / 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'hsl(45 55% 65% / 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="#D9C478" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 400,
                      color: 'var(--text-muted)',
                    }}>HRV</span>
                    <span style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '18px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}>
                      {(session as any).avgHRV || 0}
                      <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '4px' }}>ms</span>
                    </span>
                  </div>
                </div>
              )}
              
              {/* Recovery Card */}
              {(session as any).recoveryPoints !== undefined && (
                <div 
                  className="summary-body-rhythm-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
                    border: '1px solid hsl(270 10% 25% / 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'hsl(270 40% 55% / 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="#9e59b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                      <polyline points="17 6 23 6 23 12"/>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 400,
                      color: 'var(--text-muted)',
                    }}>Recovery</span>
                    <span style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '18px',
                      fontWeight: 600,
                      color: '#22c55e',
                    }}>
                      +{(session as any).recoveryPoints || 0}
                      <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '4px', color: 'var(--text-primary)' }}>pts</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CTA Buttons - Target 6: Back to Home secondary, Start Another Journey primary */}
      <footer 
        className="summary-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          paddingTop: '16px',
        }}
      >
        <motion.button
          className="btn btn-secondary btn-large"
          onClick={() => navigate('/home')}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: '14px 28px',
            background: 'hsl(270 10% 18%)',
            color: 'var(--text-primary)',
            border: '1px solid hsl(270 10% 30%)',
            borderRadius: '999px',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Back to Home
        </motion.button>
        <motion.button
          className="btn btn-primary btn-large"
          onClick={onNewSession}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: '14px 28px',
            background: 'linear-gradient(135deg, #D9C478, #C9B468)',
            color: '#0c0a0e',
            border: 'none',
            borderRadius: '999px',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 4px 20px hsl(45 55% 70% / 0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          Start Another Journey
        </motion.button>
      </footer>
    </motion.div>
  );
}
