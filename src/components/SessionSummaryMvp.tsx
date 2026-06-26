/**
 * BrainBit iPad MVP — end-of-session summary (the take-home deliverable).
 *
 * Honest, EEG-only metrics: no HR/HRV/recovery (BrainBit has no PPG).
 * Reuses the shared PDF + email helpers; leaves the desktop SessionSummary
 * (Muse/PPG) untouched. Guest can have the summary emailed to them.
 */

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Session, SessionStats, User } from '../types';
import { formatTime, formatTimeWithUnit } from '../lib/storage';
import { exportSummarySnapshotPdf, type FallbackPdfData } from '../lib/summary-pdf';
import { sendSessionReportEmail } from '../lib/email-service';
import { getJourneys, getLastJourneyId } from '../lib/session-storage';

interface SessionSummaryMvpProps {
  session: Session;
  stats: SessionStats;
  user: User;
  onStartAgain: () => void;
}

type SendState = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SessionSummaryMvp({ session, stats, user, onStartAgain }: SessionSummaryMvpProps) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [email, setEmail] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState<string | null>(null);

  const journeyName = useMemo(() => {
    const journeyId = getLastJourneyId(user.id);
    const journeys = getJourneys();
    return (journeys.find((j) => j.id === journeyId) ?? journeys[0]).name;
  }, [user.id]);

  const peakCoherence = useMemo(() => {
    if (session.coherenceHistory.length === 0) return session.avgCoherence;
    return Math.max(...session.coherenceHistory);
  }, [session.coherenceHistory, session.avgCoherence]);

  const stability = useMemo(() => {
    const score = stats.achievementScore;
    if (score === 'Mastery' || score === 'Flowing') return { label: 'High', sub: 'Minimal variance' };
    if (score === 'Settled') return { label: 'Medium', sub: 'Moderate variance' };
    return { label: 'Low', sub: 'Variable' };
  }, [stats.achievementScore]);

  const interpretation = useMemo(() => {
    const percent = stats.coherencePercent;
    const peak = Math.round(peakCoherence * 100);
    if (percent >= 70) return `Excellent session. Your coherence peaked at ${peak}% and stayed remarkably steady throughout the journey.`;
    if (percent >= 50) return `Strong session. Your coherence peaked at ${peak}% and held well across the journey.`;
    if (percent >= 30) return `Good progress toward coherence. Your peak reached ${peak}%.`;
    return `A gentle start. Your coherence peaked at ${peak}% — every session trains the nervous system a little more.`;
  }, [stats.coherencePercent, peakCoherence]);

  const fallbackData = useMemo<FallbackPdfData>(() => ({
    userName: user.name,
    journeyName,
    sessionDate: new Date(session.startTime).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    durationFormatted: formatTimeWithUnit(session.duration),
    coherencePercent: stats.coherencePercent,
    peakCoherence,
    stability: stability.label,
    longestStreakFormatted: formatTime(stats.longestStreak),
    interpretation,
    // Body metrics intentionally omitted — BrainBit has no PPG.
  }), [user.name, journeyName, session, stats, peakCoherence, stability.label, interpretation]);

  // Draw the coherence timeline (3 zones: Coherence / Settling / Active).
  useEffect(() => {
    const canvas = canvasRef.current;
    const history = session.coherenceHistory;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padL = 44;
    const padR = 10;
    const padT = 16;
    const padB = 22;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    ctx.clearRect(0, 0, width, height);

    const coherenceMin = 0.7;
    const stabilizingMin = 0.4;
    const coherenceY = padT + chartH * (1 - coherenceMin);
    const stabilizingY = padT + chartH * (1 - stabilizingMin);

    ctx.fillStyle = 'rgba(223, 197, 139, 0.06)';
    ctx.fillRect(padL, padT, chartW, coherenceY - padT);
    ctx.fillStyle = 'rgba(180, 160, 170, 0.03)';
    ctx.fillRect(padL, coherenceY, chartW, stabilizingY - coherenceY);
    ctx.fillStyle = 'rgba(158, 89, 184, 0.05)';
    ctx.fillRect(padL, stabilizingY, chartW, padT + chartH - stabilizingY);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    [coherenceY, stabilizingY].forEach((yy) => {
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(padL + chartW, yy);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Coherence', padL - 6, (padT + coherenceY) / 2);
    ctx.fillText('Settling', padL - 6, (coherenceY + stabilizingY) / 2);
    ctx.fillText('Active', padL - 6, (stabilizingY + padT + chartH) / 2);

    if (history.length < 2) return;

    const spacing = chartW / (history.length - 1);
    const pts = history.map((v, i) => ({
      x: padL + i * spacing,
      y: padT + chartH * (1 - Math.max(0, Math.min(1, v))),
    }));

    const trace = () => {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const cpX = (p0.x + p1.x) / 2;
        const cpY = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, cpX, cpY);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    };

    const fill = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    fill.addColorStop(0, 'rgba(223, 197, 139, 0.25)');
    fill.addColorStop(1, 'rgba(158, 89, 184, 0.18)');
    ctx.beginPath();
    trace();
    ctx.lineTo(pts[pts.length - 1].x, padT + chartH);
    ctx.lineTo(pts[0].x, padT + chartH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    const stroke = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    stroke.addColorStop(0, '#dfc58b');
    stroke.addColorStop(1, '#9e59b8');
    ctx.beginPath();
    trace();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(223, 197, 139, 0.3)';
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [session.coherenceHistory]);

  const handleSend = useCallback(async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setSendState('error');
      setSendError('Please enter a valid email address.');
      return;
    }
    setSendState('sending');
    setSendError(null);
    try {
      let pdfBlob: Blob | undefined;
      try {
        pdfBlob = await exportSummarySnapshotPdf(summaryRef.current, fallbackData);
      } catch (e) {
        console.warn('[SummaryMvp] PDF generation failed, sending without attachment', e);
      }
      await sendSessionReportEmail(trimmed, session, stats, pdfBlob);
      setSendState('sent');
    } catch (e) {
      console.error('[SummaryMvp] Email send failed', e);
      setSendState('error');
      setSendError(e instanceof Error ? e.message : 'Could not send the summary. Please try again.');
    }
  }, [email, fallbackData, session, stats]);

  const coherencePct = Math.round(stats.coherencePercent);
  const avgPct = Math.round(session.avgCoherence * 100);
  const peakPct = Math.round(peakCoherence * 100);

  const metrics: { label: string; value: string }[] = [
    { label: 'Duration', value: formatTimeWithUnit(session.duration) },
    { label: 'Time in Coherence', value: `${coherencePct}%` },
    { label: 'Peak Coherence', value: `${peakPct}%` },
    { label: 'Avg Coherence', value: `${avgPct}%` },
    { label: 'Longest Streak', value: formatTime(stats.longestStreak) },
    { label: 'Stability', value: stability.label },
  ];

  return (
    <motion.div
      className="screen screen-summary"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ minHeight: '100vh', overflowY: 'auto', padding: '32px 20px 48px' }}
    >
      <div ref={summaryRef} style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p
            style={{
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 8,
            }}
          >
            {journeyName} · {new Date(session.startTime).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Session complete
          </h1>
        </div>

        {/* Coherence ring */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
          <CoherenceRing percent={coherencePct} />
          <p
            style={{
              color: 'var(--text-muted)',
              maxWidth: 420,
              textAlign: 'center',
              marginTop: 16,
              lineHeight: 1.6,
              fontSize: 14,
            }}
          >
            {interpretation}
          </p>
        </div>

        {/* Metrics grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {metrics.map((m) => (
            <div
              key={m.label}
              style={{
                background: 'hsl(270 10% 8% / 0.8)',
                border: '1px solid hsl(270 10% 22% / 0.4)',
                borderRadius: 12,
                padding: '16px 14px',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div
          style={{
            background: 'linear-gradient(165deg, hsl(270 7% 14% / 0.7), hsl(270 10% 8% / 0.8))',
            border: '1px solid hsl(275 20% 25% / 0.35)',
            borderRadius: 16,
            padding: 16,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 10,
            }}
          >
            Coherence Timeline
          </div>
          <canvas ref={canvasRef} style={{ width: '100%', height: 160, display: 'block' }} />
        </div>
      </div>

      {/* Email capture (excluded from PDF snapshot) */}
      <div data-export-ignore style={{ maxWidth: 720, margin: '0 auto' }}>
        {sendState !== 'sent' ? (
          <div
            style={{
              background: 'hsl(270 8% 11% / 0.8)',
              border: '1px solid hsl(275 15% 28% / 0.35)',
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 }}>
              Take this experience home
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
              Enter your email and we'll send your session summary.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (sendState === 'error') {
                    setSendState('idle');
                    setSendError(null);
                  }
                }}
                placeholder="you@example.com"
                disabled={sendState === 'sending'}
                style={{
                  flex: '1 1 220px',
                  background: 'hsl(270 7% 14% / 0.9)',
                  border: '1px solid hsl(275 15% 28% / 0.5)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  color: 'var(--text-primary)',
                  fontSize: 16,
                  outline: 'none',
                }}
              />
              <motion.button
                type="button"
                onClick={handleSend}
                disabled={sendState === 'sending'}
                whileHover={{ scale: sendState === 'sending' ? 1 : 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: 'linear-gradient(135deg, #D9C478, #c4a85e)',
                  color: '#0c0a0e',
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px 24px',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: sendState === 'sending' ? 'default' : 'pointer',
                  opacity: sendState === 'sending' ? 0.7 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {sendState === 'sending' ? 'Sending…' : 'Email me my summary'}
              </motion.button>
            </div>
            {sendError && (
              <div style={{ color: 'hsl(0 65% 70%)', fontSize: 13, marginTop: 10 }}>{sendError}</div>
            )}
          </div>
        ) : (
          <div
            style={{
              background: 'hsl(160 40% 14% / 0.5)',
              border: '1px solid hsl(160 45% 45% / 0.4)',
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
              textAlign: 'center',
              color: 'var(--text-primary)',
            }}
          >
            Summary sent to <strong>{email.trim()}</strong>. Check your inbox.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <motion.button
            type="button"
            onClick={onStartAgain}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            style={{
              background: 'hsl(270 7% 14% / 0.8)',
              color: 'var(--text-primary)',
              border: '1px solid hsl(275 15% 28% / 0.4)',
              borderRadius: 12,
              padding: '14px 36px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Start again
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function CoherenceRing({ percent }: { percent: number }) {
  const size = 168;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circ * (1 - clamped / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(270 8% 18%)" strokeWidth={stroke} />
        <defs>
          <linearGradient id="mvpRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#dfc58b" />
            <stop offset="100%" stopColor="#9e59b8" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#mvpRing)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
          {clamped}
          <span style={{ fontSize: 18, fontWeight: 400, color: 'var(--text-muted)' }}>%</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Coherence</div>
      </div>
    </div>
  );
}
