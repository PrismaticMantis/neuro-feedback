// Session Detail – full summary + graph, Share, Back to Home (iPad-friendly)

import { useParams, Link } from 'react-router-dom';
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatTime } from '../lib/storage';
import { getSessionRecord, getJourneys } from '../lib/session-storage';
import { ENABLE_PDF_EXPORT as PDF_FLAG } from '../lib/feature-flags';
import type { User } from '../types';

interface SessionDetailProps {
  users: User[];
}

function getJourneyName(journeyId: string): string {
  const j = getJourneys().find((g) => g.id === journeyId);
  return j?.name ?? 'Session';
}

function drawDetailGraph(canvas: HTMLCanvasElement, series: number[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx || series.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(223, 197, 139, 0.2)'); /* accent.primary with opacity */
  grad.addColorStop(1, 'rgba(223, 197, 139, 0.02)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.strokeStyle = '#dfc58b'; /* accent.primary - Champagne */
  ctx.lineWidth = 2.5;
  const step = w / (series.length - 1);
  series.forEach((v, i) => {
    const x = i * step;
    const y = h * (1 - v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(223, 197, 139, 0.1)'; /* accent.primary with opacity */
  ctx.fill();
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function SessionDetail({ users }: SessionDetailProps) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const record = sessionId ? getSessionRecord(sessionId) : null;
  const user = record && users.length
    ? (users.find((u) => u.id === record.userId) || null)
    : null;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !record || record.graphSeries.length < 2) return;
    drawDetailGraph(c, record.graphSeries);
  }, [record]);

  const handleShare = useCallback(async () => {
    if (!record) return;
    setIsSharing(true);
    setShareError(null);

    try {
      let blob: Blob | null = null;
      if (PDF_FLAG) {
        try {
          const { jsPDF } = await import('jspdf');
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          const m = 20;
          let y = 20;
          pdf.setFontSize(24);
          pdf.setTextColor(79, 209, 197);
          pdf.text('Session Report', m, y);
          y += 12;
          pdf.setFontSize(12);
          pdf.setTextColor(100, 100, 100);
          if (user) pdf.text(`User: ${user.name}`, m, y);
          y += 6;
          pdf.text(`Date: ${new Date(record.endedAt).toLocaleDateString()}`, m, y);
          y += 6;
          pdf.text(`Time: ${new Date(record.endedAt).toLocaleTimeString()}`, m, y);
          y += 10;
          pdf.setFontSize(48);
          pdf.setTextColor(79, 209, 197);
          pdf.text(`${Math.round(record.coherencePercent)}%`, 105, y, { align: 'center' });
          y += 8;
          pdf.setFontSize(14);
          pdf.setTextColor(150, 150, 150);
          pdf.text('Time in Coherence', 105, y, { align: 'center' });
          y += 14;
          pdf.setFontSize(11);
          pdf.setTextColor(80, 80, 80);
          pdf.text(`Duration: ${formatTime(record.durationMs)}`, m, y);
          y += 6;
          pdf.text(`Longest streak: ${formatTime(record.longestStreakMs)}`, m, y);
          y += 6;
          pdf.text(`Stability: ${record.stabilityLevel}`, m, y);
          const buf = pdf.output('arraybuffer');
          blob = new Blob([buf], { type: 'application/pdf' });
        } catch (_) {
          /* PDF failed, use text fallback */
        }
      }

      const text = `Session Report\n${user ? `User: ${user.name}\n` : ''}Date: ${new Date(record.endedAt).toLocaleString()}\nDuration: ${formatTime(record.durationMs)}\nTime in Coherence: ${Math.round(record.coherencePercent)}%\nLongest streak: ${formatTime(record.longestStreakMs)}\nStability: ${record.stabilityLevel}`;

      if (navigator.share) {
        const payload: ShareData = { text };
        if (blob) {
          const f = new File([blob], `session-${record.id}.pdf`, { type: 'application/pdf' });
          if (navigator.canShare && navigator.canShare({ files: [f] })) payload.files = [f];
        }
        await navigator.share(payload);
      } else if (blob && !isIOS()) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${record.id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await navigator.clipboard.writeText(text);
        setShareError('Copied summary to clipboard.');
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setShareError((e as Error)?.message ?? 'Share failed');
    } finally {
      setIsSharing(false);
    }
  }, [record, user]);

  if (!sessionId || !record) {
    return (
      <motion.div className="screen screen-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <header className="screen-header">
          <h1>Session not found</h1>
        </header>
        <Link to="/history" className="btn btn-secondary">← Back to History</Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="screen screen-detail screen-wide"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      style={{ paddingBottom: 80 }}
    >
      <header className="screen-header">
        <h1>Session Details</h1>
        <p className="footer-hint" style={{ marginTop: 8 }}>
          {new Date(record.endedAt).toLocaleDateString()} · {getJourneyName(record.journeyId)}
        </p>
      </header>

      <div className="detail-content">
        <div className="detail-stat">
          <span className="detail-percent">{Math.round(record.coherencePercent)}%</span>
          <span className="detail-label">Time in Coherence</span>
        </div>

        <div className="detail-grid">
          <div className="detail-card">
            <span className="detail-card-label">Duration</span>
            <span className="detail-card-value">{formatTime(record.durationMs)}</span>
          </div>
          <div className="detail-card">
            <span className="detail-card-label">Longest streak</span>
            <span className="detail-card-value">{formatTime(record.longestStreakMs)}</span>
          </div>
          <div className="detail-card">
            <span className="detail-card-label">Stability</span>
            <span className="detail-card-value">{record.stabilityLevel}</span>
          </div>
          <div className="detail-card">
            <span className="detail-card-label">Avg. coherence</span>
            <span className="detail-card-value">{record.avgCoherenceLevel.toFixed(2)}</span>
          </div>
        </div>

        {record.graphSeries.length > 1 && (
          <div className="detail-graph-wrap">
            <h3 className="subsection-title">Coherence over time</h3>
            <canvas ref={canvasRef} className="detail-graph" />
          </div>
        )}
      </div>

      <footer className="screen-footer">
        {shareError && <p className="footer-hint" style={{ color: 'var(--warning)' }}>{shareError}</p>}
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={handleShare}
          disabled={isSharing}
        >
          {isSharing ? 'Preparing…' : 'Share'}
        </button>
        <Link to="/home" className="btn btn-text">← Back to Home</Link>
      </footer>
    </motion.div>
  );
}
