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
      avgHeartRate: session.avgHeartRate ?? null,
      avgHRV: session.avgHRV ?? null,
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

  /** Build plain-text summary for email body */
  const buildShareText = useCallback(() => {
    const hrText = session.avgHeartRate != null ? `\nHeart Rate: ${Math.round(session.avgHeartRate)} bpm` : '';
    const hrvText = session.avgHRV != null ? `\nHRV: ${Math.round(session.avgHRV)} ms` : '';
    return `SoundBed Session Report\nUser: ${user.name}\nJourney: ${journeyName}\nDate: ${new Date(session.startTime).toLocaleString()}\nDuration: ${formatTime(stats.totalLength)} min\nCoherence: ${Math.round(stats.coherencePercent)}%\nPeak: ${Math.round(peakCoherence * 100)}%\nStability: ${stability}${hrText}${hrvText}`;
  }, [session, stats, user, journeyName, peakCoherence, stability]);

  /** Email share — opens mailto with session text */
  const handleEmail = useCallback(() => {
    const subject = encodeURIComponent(`SoundBed Session – ${journeyName} – ${new Date(session.startTime).toLocaleDateString()}`);
    const body = encodeURIComponent(buildShareText());
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  }, [session, journeyName, buildShareText]);

  /** Download PDF to device */
  const handleDownloadPdf = useCallback(async () => {
    setIsSharing(true);
    try {
      const blob = await getPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SoundBed-Session-${new Date(session.startTime).toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF download failed:', e);
    } finally {
      setIsSharing(false);
    }
  }, [session, getPdfBlob]);

  /**
   * Draw timeline graph with 3 mental state zones and vertical color layering.
   * 
   * Intentional deviation from Lovable: vertical layering yellow above purple.
   * - Top (high coherence): warm champagne/gold
   * - Bottom (low coherence / active mind): soft purple/amethyst
   * 
   * Three zones (matching getCoherenceZone() in flow-state.ts):
   *   Coherence (top):      >= 0.7  → gold tint
   *   Stabilizing (middle): 0.4–0.7 → transitional
   *   Active Mind (bottom): < 0.4   → purple tint
   */
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

    // Zone thresholds (coherence 0–1 range) — MUST match getCoherenceZone() in flow-state.ts
    const coherenceMin = 0.7;
    const stabilizingMin = 0.4;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Zone colors (matching CoherenceGraph component)
    const zoneCoherence = 'rgba(223, 197, 139, 0.06)';
    const zoneStabilizing = 'rgba(180, 160, 170, 0.03)';
    const zoneActiveMind = 'rgba(158, 89, 184, 0.05)';
    const zoneLine = 'rgba(255, 255, 255, 0.06)';
    const zoneLabel = 'rgba(255, 255, 255, 0.25)';

    const chartX = paddingLeft;
    const chartY = paddingTop;

    // Y positions for zone boundaries within chart area
    const coherenceLineY = chartY + chartHeight * (1 - coherenceMin);
    const stabilizingLineY = chartY + chartHeight * (1 - stabilizingMin);

    // Draw zone bands within chart area
    ctx.fillStyle = zoneCoherence;
    ctx.fillRect(chartX, chartY, chartWidth, coherenceLineY - chartY);

    ctx.fillStyle = zoneStabilizing;
    ctx.fillRect(chartX, coherenceLineY, chartWidth, stabilizingLineY - coherenceLineY);

    ctx.fillStyle = zoneActiveMind;
    ctx.fillRect(chartX, stabilizingLineY, chartWidth, chartY + chartHeight - stabilizingLineY);

    // Draw zone boundary lines (dashed)
    ctx.strokeStyle = zoneLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);

    ctx.beginPath();
    ctx.moveTo(chartX, coherenceLineY);
    ctx.lineTo(chartX + chartWidth, coherenceLineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(chartX, stabilizingLineY);
    ctx.lineTo(chartX + chartWidth, stabilizingLineY);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw Y-axis labels (zone names instead of percentages)
    ctx.fillStyle = zoneLabel;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Coherence', chartX - 6, (chartY + coherenceLineY) / 2);
    ctx.fillText('Settling', chartX - 6, (coherenceLineY + stabilizingLineY) / 2);
    ctx.fillText('Active', chartX - 6, (stabilizingLineY + chartY + chartHeight) / 2);

    // Draw X-axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const durationMinutes = Math.ceil(session.duration / 60000);
    const xLabelCount = 5;
    for (let i = 0; i < xLabelCount; i++) {
      const minutes = Math.round((durationMinutes / (xLabelCount - 1)) * i);
      const x = chartX + (chartWidth / (xLabelCount - 1)) * i;
      const timeStr = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
      ctx.fillText(timeStr, x, height - paddingBottom + 8);
    }

    // Draw line with bezier smoothing
    const pointSpacing = chartWidth / (history.length - 1);
    const points = history.map((value, index) => ({
      x: chartX + index * pointSpacing,
      y: chartY + chartHeight * (1 - value),
    }));

    // Helper: trace bezier path through points
    const traceBezierPath = () => {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        if (i === 0) {
          const cpX = (p0.x + p1.x) / 2;
          const cpY = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(cpX, cpY, p1.x, p1.y);
        } else {
          const prevP = points[i - 1];
          const cp1X = p0.x + (p1.x - prevP.x) * 0.3;
          const cp1Y = p0.y + (p1.y - prevP.y) * 0.3;
          const cp2X = p1.x - (p1.x - p0.x) * 0.3;
          const cp2Y = p1.y - (p1.y - p0.y) * 0.3;
          ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, p1.x, p1.y);
        }
      }
    };

    // Vertical fill gradient (gold top, purple bottom)
    // Intentional deviation from Lovable: vertical layering yellow above purple.
    const fillGradient = ctx.createLinearGradient(0, chartY, 0, chartY + chartHeight);
    fillGradient.addColorStop(0, 'rgba(223, 197, 139, 0.25)');
    fillGradient.addColorStop(1, 'rgba(158, 89, 184, 0.20)');

    // Draw filled area under line
    ctx.beginPath();
    traceBezierPath();
    ctx.lineTo(points[points.length - 1].x, chartY + chartHeight);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.closePath();
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Vertical stroke gradient (gold top, purple bottom)
    const strokeGradient = ctx.createLinearGradient(0, chartY, 0, chartY + chartHeight);
    strokeGradient.addColorStop(0, '#dfc58b');
    strokeGradient.addColorStop(1, '#9e59b8');

    // Draw main line
    ctx.beginPath();
    traceBezierPath();
    ctx.strokeStyle = strokeGradient;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(223, 197, 139, 0.3)';
    ctx.stroke();
    ctx.shadowBlur = 0;
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
        padding: '0 24px 16px',
        maxWidth: '800px',
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
          padding: '12px 0',
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
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid hsl(275 20% 25% / 0.35)',
              borderRadius: '12px',
              color: saved ? 'var(--text-subtle)' : 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 400,
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
            onClick={handleEmail}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid hsl(275 20% 25% / 0.35)',
              borderRadius: '12px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 400,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <span>Email</span>
          </button>
          <button
            className="summary-action-btn"
            onClick={handleShare}
            disabled={isSharing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid hsl(275 20% 25% / 0.35)',
              borderRadius: '12px',
              color: isSharing ? 'var(--text-subtle)' : 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 400,
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
          <button
            className="summary-action-btn"
            onClick={handleDownloadPdf}
            disabled={isSharing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid hsl(275 20% 25% / 0.35)',
              borderRadius: '12px',
              color: isSharing ? 'var(--text-subtle)' : 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 400,
              cursor: isSharing ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>PDF</span>
          </button>
        </div>
      </header>

      <div className="summary-content">
        {/* Hero Section - Target 6: Glass card with coherence ring */}
        <div 
          className="summary-hero"
      style={{
            background: 'linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))',
            border: '1px solid hsl(275 20% 25% / 0.35)',
            borderRadius: '16px',
            padding: '24px 20px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 4px 20px hsl(270 20% 2% / 0.6)',
            textAlign: 'center',
            marginBottom: '16px',
          }}
        >
          <p 
            className="summary-complete-label"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              margin: '0 0 4px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
            }}
          >Session Complete</p>
          <h2 
            className="summary-journey-name"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '24px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              margin: '0 0 12px',
              lineHeight: 1.25,
            }}
          >{journeyName}</h2>
          
          {/* Coherence Ring - Gold stroke with pulsing glow */}
          <motion.div 
            className="summary-coherence-ring glow-icon"
            style={{
              position: 'relative',
              margin: '0 auto 10px',
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
            {/* Number overlay — number is dead-center, % positioned after it without affecting centering */}
            <div 
              className="coherence-ring-center"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <motion.span
                className="coherence-percentage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                style={{
                  position: 'relative',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '44px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  lineHeight: 1,
                }}
              >
                {Math.round(stats.coherencePercent)}
                {/* % sign: absolutely positioned so it does NOT shift the number off-center */}
                <span style={{
                  position: 'absolute',
                  left: '100%',
                  top: '0.1em',
                  fontSize: '18px',
                  fontWeight: 400,
                  marginLeft: '2px',
                  opacity: 0.7,
                }}>%</span>
              </motion.span>
            </div>
            {/* "Coherence" label — positioned below center, outside the number's centering context */}
            <span 
              className="coherence-label"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: '15%',
                textAlign: 'center',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 400,
                color: 'var(--text-muted)',
              }}
            >Coherence</span>
          </motion.div>
          <p 
            className="summary-interpretation"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              margin: '8px 0 0',
              lineHeight: 1.5,
              maxWidth: '400px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >{sessionInterpretation}</p>
        </div>

        {/* Session Metrics Section - Lovable spec: Heading 3, Metric Card styling */}
        <div 
          className="summary-metrics-section"
          style={{
            marginBottom: '10px',
          }}
        >
          <h3 
            className="summary-section-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '20px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              margin: '0 0 10px',
              lineHeight: 1.3,
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
            {/* Duration Card — Metric Card spec */}
            <div 
              className="summary-metric-card"
              style={{
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <span 
                className="summary-metric-label"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                  lineHeight: 1.5,
                }}
              >Duration</span>
              <span 
                className="summary-metric-value"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: 1.25,
                }}
              >
                {formatTime(stats.totalLength)}
                <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px', opacity: 0.7 }}>min</span>
              </span>
            </div>
            
            {/* Avg Coherence Card — Metric Card spec */}
            <div 
              className="summary-metric-card"
              style={{
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <span 
                className="summary-metric-label"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                  lineHeight: 1.5,
                }}
              >Avg. Coherence</span>
              <span 
                className="summary-metric-value"
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: '4px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: 1.25,
                }}
              >
                {Math.round(stats.avgCoherence * 100)}
                <span style={{ fontSize: '14px', fontWeight: 400, opacity: 0.7 }}>%</span>
              </span>
            </div>
            
            {/* Peak Coherence Card — Metric Card spec */}
            <div 
              className="summary-metric-card"
              style={{
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <span 
                className="summary-metric-label"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                  lineHeight: 1.5,
                }}
              >Peak Coherence</span>
              <span 
                className="summary-metric-value"
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: 1.25,
                }}
              >
                {Math.round(peakCoherence * 100)}
                <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '3px', opacity: 0.7 }}>%</span>
              </span>
            </div>
            
            {/* Stability Card — Metric Card spec */}
            <div 
              className="summary-metric-card"
              style={{
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <span 
                className="summary-metric-label"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                  lineHeight: 1.5,
                }}
              >Stability</span>
              <span 
                className="summary-metric-value"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: 1.25,
                }}
              >{stability}</span>
              <span 
                className="summary-metric-subtext"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-subtle)',
                  marginTop: '4px',
                }}
              >{stabilitySubtext}</span>
            </div>
          </div>
        </div>

        {/* Coherence Timeline — Card (Glass) spec */}
        <div 
          className="summary-timeline-section"
          style={{
            marginBottom: '10px',
          }}
        >
          <h3 
            className="summary-section-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '20px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              margin: '0 0 10px',
              lineHeight: 1.3,
            }}
          >Coherence Timeline</h3>
          <div 
            className="summary-timeline-chart"
            style={{
              background: 'linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))',
              border: '1px solid hsl(275 20% 25% / 0.35)',
              borderRadius: '16px',
              padding: '16px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 4px 20px hsl(270 20% 2% / 0.6)',
              height: '220px',
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

        {/* Body Rhythm Section — Metric Card spec */}
        <div 
          className="summary-body-rhythm-section"
          style={{
            marginBottom: '16px',
          }}
        >
          <h3 
            className="summary-section-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '20px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              margin: '0 0 10px',
              lineHeight: 1.3,
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
            {/* Heart Rate Card — Metric Card spec */}
            <div 
              className="summary-body-rhythm-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: '12px',
                padding: '16px',
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
                <svg viewBox="0 0 24 24" fill="none" stroke="hsl(350 55% 55%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}>Heart Rate</span>
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '20px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: 1.3,
                }}>
                  {session.avgHeartRate != null ? session.avgHeartRate : '—'}
                  {session.avgHeartRate != null && (
                    <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '4px', opacity: 0.7 }}>bpm</span>
                  )}
                </span>
              </div>
            </div>
            
            {/* HRV Card — Metric Card spec */}
            <div 
              className="summary-body-rhythm-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'hsl(45 30% 50% / 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="hsl(45 35% 72%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}>HRV</span>
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '20px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: 1.3,
                }}>
                  {session.avgHRV != null ? session.avgHRV : '—'}
                  {session.avgHRV != null && (
                    <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '4px', opacity: 0.7 }}>ms</span>
                  )}
                </span>
              </div>
            </div>
            
            {/* Recovery Card — Metric Card spec */}
            <div 
              className="summary-body-rhythm-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: '12px',
                padding: '16px',
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
                <svg viewBox="0 0 24 24" fill="none" stroke="hsl(270 35% 60%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  <polyline points="17 6 23 6 23 12"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}>Recovery</span>
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '20px',
                  fontWeight: 500,
                  color: 'var(--success)',
                  lineHeight: 1.3,
                }}>
                  {session.recoveryPoints != null ? '+' + session.recoveryPoints : '—'}
                  {session.recoveryPoints != null && (
                    <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '4px', opacity: 0.7, color: 'var(--text-primary)' }}>pts</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Buttons — Lovable spec: Secondary + Primary button styles */}
      <footer 
        className="summary-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          paddingTop: '12px',
        }}
      >
        <motion.button
          className="btn btn-secondary btn-large"
          onClick={() => navigate('/home')}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: '12px 24px',
            background: 'hsl(270 7% 14% / 0.8)',
            color: 'var(--text-primary)',
            border: '1px solid hsl(275 15% 28% / 0.4)',
            borderRadius: '12px',
            fontFamily: 'var(--font-sans)',
            fontSize: '16px',
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
            background: 'linear-gradient(135deg, hsl(45 55% 70%), hsl(40 50% 62%))',
            color: 'hsl(270 12% 8%)',
            border: 'none',
            borderRadius: '12px',
            fontFamily: 'var(--font-sans)',
            fontSize: '16px',
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 4px 20px hsl(270 20% 2% / 0.6), 0 0 30px hsl(45 55% 70% / 0.2)',
            transition: 'all 0.2s ease',
          }}
        >
          Start Another Journey
        </motion.button>
      </footer>
    </motion.div>
  );
}
