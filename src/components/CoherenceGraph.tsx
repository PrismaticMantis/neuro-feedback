// HeartMath-style Coherence Graph Component

import { useRef, useEffect, useState } from 'react';

interface CoherenceGraphProps {
  coherenceHistory: number[];
  coherenceZone: 'flow' | 'stabilizing' | 'noise';
  duration: number; // Current session duration in ms
}

// Zone configuration with labels, descriptions, and colors
const ZONE_CONFIG = {
  flow: {
    label: 'Coherence',
    description: 'Calm & Focused',
    color: 'var(--accent-primary)', /* Champagne */
    bgColor: 'rgba(223, 197, 139, 0.15)', /* accent.primary with opacity */
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
      </svg>
    ),
  },
  stabilizing: {
    label: 'Settling In',
    description: 'Getting There',
    color: 'var(--warning)',
    bgColor: 'rgba(251, 191, 36, 0.1)',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M17.66 8L12 2.35 6.34 8C4.78 9.56 4 11.64 4 13.64s.78 4.11 2.34 5.67 3.61 2.35 5.66 2.35 4.1-.79 5.66-2.35S20 15.64 20 13.64 19.22 9.56 17.66 8zM6 14c.01-2 .62-3.27 1.76-4.4L12 5.27l4.24 4.38C17.38 10.77 17.99 12 18 14H6z" />
      </svg>
    ),
  },
  noise: {
    label: 'Active Mind',
    description: 'Mind Wandering',
    color: 'var(--error)',
    bgColor: 'rgba(248, 113, 113, 0.08)',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M7 2v11h3v9l7-12h-4l4-8z" />
      </svg>
    ),
  },
};

const ZONE_THRESHOLDS = {
  flow: 0.7,
  stabilizing: 0.4,
};

// Coordinate mapping function for graph
function mapValueToY(
  value: number,
  height: number,
  paddingTop: number = 0,
  paddingBottom: number = 0
): number {
  const usableHeight = height - paddingTop - paddingBottom;
  return paddingTop + usableHeight * (1 - value);
}

// Smoothing function for display (visual only, doesn't affect raw data)
function smoothValue(current: number, previous: number, alpha: number = 0.3): number {
  return alpha * current + (1 - alpha) * previous;
}

export function CoherenceGraph({
  coherenceHistory,
  coherenceZone,
  duration,
}: CoherenceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [smoothedHistory, setSmoothedHistory] = useState<number[]>([]);
  const previousSmoothedRef = useRef<number | null>(null);

  // Smooth coherence history for display (visual only)
  useEffect(() => {
    if (coherenceHistory.length === 0) {
      setSmoothedHistory([]);
      previousSmoothedRef.current = null;
      return;
    }

    const smoothed = coherenceHistory.map((value, index) => {
      if (index === 0 || previousSmoothedRef.current === null) {
        previousSmoothedRef.current = value;
        return value;
      }
      const smoothedValue = smoothValue(value, previousSmoothedRef.current, 0.3);
      previousSmoothedRef.current = smoothedValue;
      return smoothedValue;
    });

    setSmoothedHistory(smoothed);
  }, [coherenceHistory]);

  // Draw the graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw zone backgrounds with subtle tints (minimal, professional)
    const flowY = height * (1 - ZONE_THRESHOLDS.flow);
    const stabilizingY = height * (1 - ZONE_THRESHOLDS.stabilizing);

    // Coherence Zone (top) - very subtle champagne tint (SoundBed spec)
    ctx.fillStyle = 'rgba(223, 197, 139, 0.06)'; /* accent.primary with opacity */
    ctx.fillRect(0, 0, width, flowY);

    // Stabilizing Zone (middle) - very subtle yellow tint
    ctx.fillStyle = 'rgba(251, 191, 36, 0.04)';
    ctx.fillRect(0, flowY, width, stabilizingY - flowY);

    // Active Mind Zone (bottom) - very subtle red tint
    ctx.fillStyle = 'rgba(248, 113, 113, 0.03)';
    ctx.fillRect(0, stabilizingY, width, height - stabilizingY);

    // Draw minimal zone divider lines (faint, non-distracting)
    ctx.strokeStyle = 'rgba(223, 197, 139, 0.15)'; /* accent.primary with opacity */
    ctx.lineWidth = 0.5;
    ctx.setLineDash([8, 8]);

    ctx.beginPath();
    ctx.moveTo(0, flowY);
    ctx.lineTo(width, flowY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.15)';
    ctx.beginPath();
    ctx.moveTo(0, stabilizingY);
    ctx.lineTo(width, stabilizingY);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw coherence line (use smoothed history for visual smoothness)
    const historyToDraw = smoothedHistory.length > 0 ? smoothedHistory : coherenceHistory;
    
    if (historyToDraw.length > 1) {
      // Determine line width based on device (thicker on iPad)
      const isTablet = window.innerWidth >= 768;
      const lineWidth = isTablet ? 3.5 : 2.5;
      
      const pointSpacing = width / Math.max(historyToDraw.length - 1, 1);

      // Prepare points for bezier curve smoothing
      const points: Array<{ x: number; y: number }> = historyToDraw.map((value, index) => ({
        x: index * pointSpacing,
        y: mapValueToY(value, height),
      }));

      // Draw glow effect first (behind the line) with smooth bezier curve
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(223, 197, 139, 0.3)'; /* accent.primary with opacity */
      ctx.lineWidth = lineWidth + 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(223, 197, 139, 0.5)'; /* accent.primary with opacity */

      // Draw smooth bezier curve
      if (points.length >= 2) {
        ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i];
          const p1 = points[i + 1];
          
          if (i === 0) {
            // First segment: use quadratic curve
            const cpX = (p0.x + p1.x) / 2;
            const cpY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(cpX, cpY, p1.x, p1.y);
          } else {
            // Subsequent segments: use smooth bezier curves
            const prevP = points[i - 1];
            const cp1X = p0.x + (p1.x - prevP.x) * 0.3;
            const cp1Y = p0.y + (p1.y - prevP.y) * 0.3;
            const cp2X = p1.x - (p1.x - p0.x) * 0.3;
            const cp2Y = p1.y - (p1.y - p0.y) * 0.3;
            ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, p1.x, p1.y);
          }
        }
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Draw main line on top with smooth bezier curve
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw smooth bezier curve (same as glow)
      if (points.length >= 2) {
        ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i];
          const p1 = points[i + 1];
          
          if (i === 0) {
            // First segment: use quadratic curve
            const cpX = (p0.x + p1.x) / 2;
            const cpY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(cpX, cpY, p1.x, p1.y);
          } else {
            // Subsequent segments: use smooth bezier curves
            const prevP = points[i - 1];
            const cp1X = p0.x + (p1.x - prevP.x) * 0.3;
            const cp1Y = p0.y + (p1.y - prevP.y) * 0.3;
            const cp2X = p1.x - (p1.x - p0.x) * 0.3;
            const cp2Y = p1.y - (p1.y - p0.y) * 0.3;
            ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, p1.x, p1.y);
          }
        }
      }

      ctx.stroke();
    }
  }, [coherenceHistory, smoothedHistory]);

  // Format time display
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate time markers
  const totalMinutes = Math.max(5, Math.ceil(duration / 60000));
  const timeMarkers = Array.from({ length: 4 }, (_, i) => 
    Math.round((i / 3) * totalMinutes)
  );

  return (
    <div className="coherence-graph">
      {/* Zone labels with icons - minimal, clean design */}
      <div className="zone-labels">
        {(['flow', 'stabilizing', 'noise'] as const).map((zone) => {
          const config = ZONE_CONFIG[zone];
          const isActive = coherenceZone === zone;
          
          return (
            <div 
              key={zone}
              className={`zone-label ${isActive ? 'active' : ''}`}
              style={{ 
                borderLeftColor: isActive ? config.color : 'transparent',
                backgroundColor: isActive ? config.bgColor : 'transparent',
              }}
            >
              <span className="zone-icon" style={{ color: config.color }}>
                {config.icon}
              </span>
              <div className="zone-text">
                <span className="zone-name">{config.label}</span>
                <span className="zone-desc">{config.description}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Graph canvas */}
      <div className="graph-container">
        <canvas ref={canvasRef} className="graph-canvas" />
      </div>

      {/* Time axis */}
      <div className="time-axis">
        {timeMarkers.map((mins, i) => (
          <span key={i} className="time-marker">
            {formatTime(mins * 60000)}
          </span>
        ))}
      </div>
    </div>
  );
}
