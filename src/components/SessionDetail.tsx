// Session Detail — mirrors the Summary page layout and styling for historical sessions.
// Data comes from SessionRecord (persisted) rather than live Session + SessionStats.

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatTime } from '../lib/storage';
import { getSessionRecord, getJourneys } from '../lib/session-storage';
import { deriveRecoveryPoints } from '../lib/summary-pdf';
import type { User } from '../types';

interface SessionDetailProps {
  users: User[];
}

function getJourneyName(journeyId: string): string {
  const j = getJourneys().find((g) => g.id === journeyId);
  return j?.name ?? 'Session';
}

// ---------------------------------------------------------------------------
// Graph drawing — identical to Summary page (yellow top / purple bottom)
// ---------------------------------------------------------------------------
function drawDetailGraph(canvas: HTMLCanvasElement, series: number[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx || series.length < 2) return;

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
  const chartX = paddingLeft;
  const chartY = paddingTop;

  const coherenceMin = 0.7;
  const stabilizingMin = 0.4;

  ctx.clearRect(0, 0, width, height);

  // Zone colors
  const zoneCoherence = 'rgba(223, 197, 139, 0.06)';
  const zoneStabilizing = 'rgba(180, 160, 170, 0.03)';
  const zoneActiveMind = 'rgba(158, 89, 184, 0.05)';
  const zoneLine = 'rgba(255, 255, 255, 0.06)';
  const zoneLabel = 'rgba(255, 255, 255, 0.25)';

  const coherenceLineY = chartY + chartHeight * (1 - coherenceMin);
  const stabilizingLineY = chartY + chartHeight * (1 - stabilizingMin);

  // Zone bands
  ctx.fillStyle = zoneCoherence;
  ctx.fillRect(chartX, chartY, chartWidth, coherenceLineY - chartY);
  ctx.fillStyle = zoneStabilizing;
  ctx.fillRect(chartX, coherenceLineY, chartWidth, stabilizingLineY - coherenceLineY);
  ctx.fillStyle = zoneActiveMind;
  ctx.fillRect(chartX, stabilizingLineY, chartWidth, chartY + chartHeight - stabilizingLineY);

  // Zone boundary lines
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

  // Zone labels
  ctx.fillStyle = zoneLabel;
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('Coherence', chartX - 6, (chartY + coherenceLineY) / 2);
  ctx.fillText('Settling', chartX - 6, (coherenceLineY + stabilizingLineY) / 2);
  ctx.fillText('Active', chartX - 6, (stabilizingLineY + chartY + chartHeight) / 2);

  // X-axis labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Line with bezier smoothing
  const pointSpacing = chartWidth / (series.length - 1);
  const points = series.map((value, index) => ({
    x: chartX + index * pointSpacing,
    y: chartY + chartHeight * (1 - value),
  }));

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

  // Fill gradient (gold top, purple bottom)
  const fillGradient = ctx.createLinearGradient(0, chartY, 0, chartY + chartHeight);
  fillGradient.addColorStop(0, 'rgba(223, 197, 139, 0.25)');
  fillGradient.addColorStop(1, 'rgba(158, 89, 184, 0.20)');

  ctx.beginPath();
  traceBezierPath();
  ctx.lineTo(points[points.length - 1].x, chartY + chartHeight);
  ctx.lineTo(chartX, chartY + chartHeight);
  ctx.closePath();
  ctx.fillStyle = fillGradient;
  ctx.fill();

  // Stroke gradient (gold top, purple bottom)
  const strokeGradient = ctx.createLinearGradient(0, chartY, 0, chartY + chartHeight);
  strokeGradient.addColorStop(0, '#dfc58b');
  strokeGradient.addColorStop(1, '#9e59b8');

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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Card style reusable object (matches Summary page glass cards)
const cardStyle = {
  background: 'linear-gradient(165deg, hsl(270 7% 13% / 0.75), hsl(270 10% 9% / 0.85))',
  border: '1px solid hsl(270 15% 22% / 0.35)',
  borderRadius: '16px',
  backdropFilter: 'blur(20px)',
  boxShadow: '0 4px 20px hsl(270 20% 2% / 0.6)',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SessionDetail({ users }: SessionDetailProps) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const record = sessionId ? getSessionRecord(sessionId) : null;
  const user = record && users.length
    ? (users.find((u) => u.id === record.userId) || null)
    : null;

  const journeyName = record ? getJourneyName(record.journeyId) : 'Session';

  // Derived stats from SessionRecord (matching what Summary page computes)
  const peakCoherence = record
    ? Math.max(...record.graphSeries, 0)
    : 0;
  const stability = record
    ? record.stabilityLevel === 'Very Steady' ? 'High'
      : record.stabilityLevel === 'Steady' ? 'Medium'
      : 'Low'
    : 'Low';
  const stabilitySubtext = stability === 'High' ? 'Minimal variance'
    : stability === 'Medium' ? 'Moderate variance' : 'Variable';
  const recoveryPoints = record
    ? deriveRecoveryPoints(record.coherencePercent, stability)
    : null;
  const avgHR = record?.ppgSummary?.avgHR ?? null;
  const avgHRV = record?.ppgSummary?.avgHRV ?? null;

  // Draw graph on mount
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !record || record.graphSeries.length < 2) return;
    drawDetailGraph(c, record.graphSeries);
  }, [record]);

  // ----------- Share / Email / Download handlers -----------

  const buildShareText = useCallback(() => {
    if (!record) return '';
    return [
      `SoundBed Session Report`,
      user ? `User: ${user.name}` : '',
      `Journey: ${journeyName}`,
      `Date: ${new Date(record.endedAt).toLocaleString()}`,
      `Duration: ${formatTime(record.durationMs)}`,
      `Coherence: ${Math.round(record.coherencePercent)}%`,
      `Peak: ${Math.round(peakCoherence * 100)}%`,
      `Stability: ${stability}`,
      avgHR != null ? `Heart Rate: ${Math.round(avgHR)} bpm` : '',
      avgHRV != null ? `HRV: ${Math.round(avgHRV)} ms` : '',
      recoveryPoints != null ? `Recovery Points: ${recoveryPoints}` : '',
    ].filter(Boolean).join('\n');
  }, [record, user, journeyName, peakCoherence, stability, avgHR, avgHRV, recoveryPoints]);

  const buildPdfBlob = useCallback(async (): Promise<Blob | null> => {
    if (!record) return null;
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const m = 20;
      let y = 20;

      pdf.setFontSize(22);
      pdf.setTextColor(217, 196, 120); // Champagne gold
      pdf.text('SoundBed Session Report', m, y);
      y += 10;

      pdf.setFontSize(12);
      pdf.setTextColor(160, 160, 160);
      if (user) pdf.text(`User: ${user.name}`, m, y); y += 6;
      pdf.text(`Journey: ${journeyName}`, m, y); y += 6;
      pdf.text(`Date: ${new Date(record.endedAt).toLocaleString()}`, m, y); y += 12;

      pdf.setFontSize(48);
      pdf.setTextColor(217, 196, 120);
      pdf.text(`${Math.round(record.coherencePercent)}%`, 105, y, { align: 'center' });
      y += 8;
      pdf.setFontSize(14);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Coherence', 105, y, { align: 'center' });
      y += 16;

      pdf.setFontSize(11);
      pdf.setTextColor(200, 200, 200);
      const metrics = [
        `Duration: ${formatTime(record.durationMs)}`,
        `Longest Streak: ${formatTime(record.longestStreakMs)}`,
        `Peak Coherence: ${Math.round(peakCoherence * 100)}%`,
        `Stability: ${stability}`,
      ];
      if (avgHR != null) metrics.push(`Heart Rate: ${Math.round(avgHR)} bpm`);
      if (avgHRV != null) metrics.push(`HRV: ${Math.round(avgHRV)} ms`);
      if (recoveryPoints != null) metrics.push(`Recovery Points: ${recoveryPoints}`);

      metrics.forEach((line) => {
        pdf.text(line, m, y);
        y += 7;
      });

      const buf = pdf.output('arraybuffer');
      return new Blob([buf], { type: 'application/pdf' });
    } catch (e) {
      console.warn('[SessionDetail] PDF generation failed:', e);
      return null;
    }
  }, [record, user, journeyName, peakCoherence, stability, avgHR, avgHRV, recoveryPoints]);

  /** Native share (iOS/Android share sheet) */
  const handleShare = useCallback(async () => {
    if (!record) return;
    setIsSharing(true);
    setShareStatus(null);
    try {
      const text = buildShareText();
      const pdfBlob = await buildPdfBlob();
      if (pdfBlob && navigator.share) {
        const file = new File(
          [pdfBlob],
          `SoundBed-Session-${new Date(record.endedAt).toISOString().slice(0, 10)}.pdf`,
          { type: 'application/pdf' }
        );
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title: 'SoundBed Session', text, files: [file] });
        } else {
          await navigator.share({ title: 'SoundBed Session', text });
        }
      } else if (navigator.share) {
        await navigator.share({ title: 'SoundBed Session', text });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(text);
        setShareStatus('Copied to clipboard');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setShareStatus('Share failed');
      }
    } finally {
      setIsSharing(false);
    }
  }, [record, buildShareText, buildPdfBlob]);

  /** Email share — opens mailto with session text */
  const handleEmail = useCallback(() => {
    if (!record) return;
    const subject = encodeURIComponent(`SoundBed Session – ${journeyName} – ${new Date(record.endedAt).toLocaleDateString()}`);
    const body = encodeURIComponent(buildShareText());
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  }, [record, journeyName, buildShareText]);

  /** Download PDF */
  const handleDownloadPdf = useCallback(async () => {
    if (!record) return;
    setIsSharing(true);
    setShareStatus(null);
    try {
      const blob = await buildPdfBlob();
      if (!blob) { setShareStatus('PDF generation failed'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SoundBed-Session-${new Date(record.endedAt).toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setShareStatus('PDF downloaded');
    } catch {
      setShareStatus('Download failed');
    } finally {
      setIsSharing(false);
    }
  }, [record, buildPdfBlob]);

  // ----------- Render -----------

  if (!sessionId || !record) {
    return (
      <motion.div
        className="screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ padding: '0 24px', maxWidth: '800px', margin: '0 auto' }}
      >
        <header style={{ padding: '24px 0' }}>
          <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Session not found
          </h1>
        </header>
        <Link to="/home" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>← Back to Home</Link>
      </motion.div>
    );
  }

  const coherencePct = Math.round(record.coherencePercent);
  const ringProgress = Math.min(record.coherencePercent / 100, 1);
  const circumference = 2 * Math.PI * 56;
  const strokeDashoffset = circumference * (1 - ringProgress);

  return (
    <motion.div
      className="screen session-summary"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      style={{ padding: '0 24px 32px', maxWidth: '800px', margin: '0 auto' }}
    >
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-sans)', fontSize: '14px' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleEmail}
            style={{ padding: '8px 16px', background: 'linear-gradient(165deg, hsl(270 7% 16% / 0.9), hsl(270 10% 12% / 0.9))', border: '1px solid hsl(270 15% 22% / 0.3)', borderRadius: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Email
          </button>
          <button
            onClick={handleShare}
            disabled={isSharing}
            style={{ padding: '8px 16px', background: 'linear-gradient(165deg, hsl(270 7% 16% / 0.9), hsl(270 10% 12% / 0.9))', border: '1px solid hsl(270 15% 22% / 0.3)', borderRadius: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            {isSharing ? 'Sharing…' : 'Share'}
          </button>
          {!isIOS() && (
            <button
              onClick={handleDownloadPdf}
              disabled={isSharing}
              style={{ padding: '8px 16px', background: 'linear-gradient(165deg, hsl(270 7% 16% / 0.9), hsl(270 10% 12% / 0.9))', border: '1px solid hsl(270 15% 22% / 0.3)', borderRadius: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              PDF
            </button>
          )}
        </div>
      </header>

      {/* Status message */}
      {shareStatus && (
        <p style={{ textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {shareStatus}
        </p>
      )}

      {/* Hero card — matches Summary page */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ ...cardStyle, padding: '24px 20px', marginBottom: '16px', textAlign: 'center' }}
      >
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }}>
          Session Complete
        </p>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '24px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 12px', lineHeight: 1.25 }}>
          {journeyName}
        </h2>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
          {new Date(record.endedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {/* Coherence ring */}
        <motion.div
          className="summary-coherence-ring"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 120 }}
          style={{ width: '130px', height: '130px', margin: '0 auto 16px', position: 'relative' }}
        >
          <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <defs>
              <filter id="detail-ring-glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx="60" cy="60" r="56" fill="none" stroke="hsl(270 10% 18%)" strokeWidth="5" />
            <circle cx="60" cy="60" r="56" fill="none" stroke="#D9C478" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              filter="url(#detail-ring-glow)"
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ position: 'relative', fontFamily: 'var(--font-sans)', fontSize: '44px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
              {coherencePct}
              <span style={{ position: 'absolute', left: '100%', top: '0.1em', fontSize: '18px', fontWeight: 400, marginLeft: '2px', opacity: 0.7 }}>%</span>
            </span>
          </div>
          <span style={{ position: 'absolute', bottom: '15%', left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            Coherence
          </span>
        </motion.div>
      </motion.div>

      {/* Session Metrics — 4-column grid matching Summary */}
      <div style={{ marginBottom: '10px' }}>
        <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 16px', lineHeight: 1.3 }}>
          Session Metrics
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {/* Duration */}
          <div style={{ ...cardStyle, padding: '20px' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>Duration</p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, lineHeight: 1.25 }}>{formatTime(record.durationMs)}</p>
          </div>
          {/* Longest Streak */}
          <div style={{ ...cardStyle, padding: '20px' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>Longest Streak</p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, lineHeight: 1.25 }}>{formatTime(record.longestStreakMs)}</p>
          </div>
          {/* Peak Coherence */}
          <div style={{ ...cardStyle, padding: '20px' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>Peak</p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, lineHeight: 1.25 }}>{Math.round(peakCoherence * 100)}<span style={{ fontSize: '14px', opacity: 0.7 }}>%</span></p>
          </div>
          {/* Stability */}
          <div style={{ ...cardStyle, padding: '20px' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>Stability</p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, lineHeight: 1.25 }}>{stability}</p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--text-subtle)', margin: '4px 0 0' }}>{stabilitySubtext}</p>
          </div>
        </div>
      </div>

      {/* Coherence Timeline */}
      {record.graphSeries.length > 1 && (
        <div style={{ marginBottom: '10px' }}>
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 16px', lineHeight: 1.3 }}>
            Coherence Timeline
          </h3>
          <div style={{ ...cardStyle, padding: '16px', height: '220px' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      )}

      {/* Body Rhythm (HR / HRV / Recovery) */}
      {(avgHR != null || avgHRV != null || recoveryPoints != null) && (
        <div style={{ marginBottom: '10px' }}>
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 16px', lineHeight: 1.3 }}>
            Body Rhythm
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div style={{ ...cardStyle, padding: '20px' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px' }}>Avg Heart Rate</p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                {avgHR != null ? `${Math.round(avgHR)}` : '—'}<span style={{ fontSize: '14px', opacity: 0.7 }}> bpm</span>
              </p>
            </div>
            <div style={{ ...cardStyle, padding: '20px' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px' }}>HRV</p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                {avgHRV != null ? `${Math.round(avgHRV)}` : '—'}<span style={{ fontSize: '14px', opacity: 0.7 }}> ms</span>
              </p>
            </div>
            <div style={{ ...cardStyle, padding: '20px' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px' }}>Recovery Points</p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                {recoveryPoints ?? '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ display: 'flex', justifyContent: 'center', paddingTop: '24px' }}>
        <Link
          to="/home"
          style={{ padding: '14px 28px', background: 'linear-gradient(135deg, #D9C478, #C9B468)', color: '#0c0a0e', border: 'none', borderRadius: '12px', fontFamily: 'var(--font-sans)', fontSize: '16px', fontWeight: 500, textDecoration: 'none', boxShadow: '0 4px 16px hsl(45 55% 70% / 0.25)' }}
        >
          Back to Home
        </Link>
      </footer>
    </motion.div>
  );
}
