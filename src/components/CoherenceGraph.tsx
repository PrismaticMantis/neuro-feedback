// HeartMath-style Coherence Graph Component

import { useRef, useEffect, useState } from 'react';

/**
 * Intentional deviation from Lovable: vertical layering yellow above purple.
 * 
 * The graph uses a vertical gradient (top-to-bottom) rather than horizontal:
 *   - Top (high coherence): warm champagne/gold
 *   - Bottom (low coherence / active mind): soft purple/amethyst
 * 
 * This creates an intuitive visual where rising coherence moves into the
 * warm gold zone and falling coherence drops into the purple zone.
 * 
 * Three mental states are shown as subtle horizontal zone bands:
 *   - Coherence (top):     coherence >= 0.7  → gold tint
 *   - Stabilizing (middle): 0.4 <= coherence < 0.7 → transitional
 *   - Active Mind (bottom): coherence < 0.4  → purple tint
 */
const GRAPH_COLORS = {
  // Line gradient (vertical: top = gold, bottom = purple)
  lineTop: '#dfc58b',        // Champagne gold (high coherence)
  lineBottom: '#9e59b8',     // Amethyst purple (low coherence / active mind)

  // Fill gradient (vertical: top = gold/transparent, bottom = purple/transparent)
  fillTop: 'rgba(223, 197, 139, 0.25)',
  fillBottom: 'rgba(158, 89, 184, 0.20)',

  // Zone bands (subtle background indicators)
  zoneCoherence: 'rgba(223, 197, 139, 0.06)',       // Gold tint (top)
  zoneStabilizing: 'rgba(180, 160, 170, 0.03)',      // Neutral (middle)
  zoneActiveMind: 'rgba(158, 89, 184, 0.05)',        // Purple tint (bottom)

  // Zone boundary lines
  zoneLine: 'rgba(255, 255, 255, 0.06)',

  // Zone label text
  zoneLabel: 'rgba(255, 255, 255, 0.25)',

  // Glow on the line
  lineGlow: 'rgba(223, 197, 139, 0.3)',
} as const;

// Zone thresholds (coherence 0–1 range)
// These MUST match getCoherenceZone() in flow-state.ts
const ZONE_THRESHOLDS = {
  coherenceMin: 0.7,     // Above this = Coherence / flow zone (top)
  stabilizingMin: 0.4,   // Above this = Stabilizing zone (middle)
  // Below stabilizingMin = Active Mind / noise zone (bottom)
} as const;

interface CoherenceGraphProps {
  coherenceHistory: number[];
  coherenceZone: 'flow' | 'stabilizing' | 'noise';
  duration: number; // Current session duration in ms
}

// Smoothing function for display (visual only, doesn't affect raw data)
function smoothValue(current: number, previous: number, alpha: number = 0.3): number {
  return alpha * current + (1 - alpha) * previous;
}

export function CoherenceGraph({
  coherenceHistory,
  coherenceZone: _coherenceZone,
  duration,
}: CoherenceGraphProps) {
  void _coherenceZone; // Keep prop for API compatibility
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

    // Padding — matches Summary chart layout for visual consistency
    const paddingTop = 12;
    const paddingBottom = 4;
    const paddingLeft = 52;   // Room for zone labels on the left
    const paddingRight = 8;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const chartX = paddingLeft;
    const chartY = paddingTop;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Y positions for zone boundaries within the chart area
    const coherenceLineY = chartY + chartHeight * (1 - ZONE_THRESHOLDS.coherenceMin);
    const stabilizingLineY = chartY + chartHeight * (1 - ZONE_THRESHOLDS.stabilizingMin);

    // Draw zone bands (3 horizontal regions within chart area)
    // Coherence zone (top) - subtle gold tint
    ctx.fillStyle = GRAPH_COLORS.zoneCoherence;
    ctx.fillRect(chartX, chartY, chartWidth, coherenceLineY - chartY);

    // Stabilizing zone (middle) - neutral
    ctx.fillStyle = GRAPH_COLORS.zoneStabilizing;
    ctx.fillRect(chartX, coherenceLineY, chartWidth, stabilizingLineY - coherenceLineY);

    // Active Mind zone (bottom) - subtle purple tint
    ctx.fillStyle = GRAPH_COLORS.zoneActiveMind;
    ctx.fillRect(chartX, stabilizingLineY, chartWidth, chartY + chartHeight - stabilizingLineY);

    // Draw zone boundary lines (dashed)
    ctx.strokeStyle = GRAPH_COLORS.zoneLine;
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

    // Draw zone labels (left-aligned, matching Summary chart)
    ctx.fillStyle = GRAPH_COLORS.zoneLabel;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Coherence', chartX - 6, (chartY + coherenceLineY) / 2);
    ctx.fillText('Settling', chartX - 6, (coherenceLineY + stabilizingLineY) / 2);
    ctx.fillText('Active', chartX - 6, (stabilizingLineY + chartY + chartHeight) / 2);

    // Draw coherence line (use smoothed history for visual smoothness)
    const historyToDraw = smoothedHistory.length > 0 ? smoothedHistory : coherenceHistory;
    
    if (historyToDraw.length > 1) {
      const isTablet = window.innerWidth >= 768;
      const lineWidth = isTablet ? 3.5 : 2.5;
      
      const pointSpacing = chartWidth / Math.max(historyToDraw.length - 1, 1);

      // Prepare points for bezier curve smoothing (within chart area)
      const points: Array<{ x: number; y: number }> = historyToDraw.map((value, index) => ({
        x: chartX + index * pointSpacing,
        y: chartY + chartHeight * (1 - value),
      }));

      // Helper: draw the bezier path
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

      if (points.length >= 2) {
        // Clip drawing to chart area so fill doesn't bleed into label region
        ctx.save();
        ctx.beginPath();
        ctx.rect(chartX, chartY, chartWidth, chartHeight);
        ctx.clip();

        // Vertical gradient for fill (gold top, purple bottom)
        // Intentional deviation from Lovable: vertical layering yellow above purple.
        const fillGradient = ctx.createLinearGradient(0, chartY, 0, chartY + chartHeight);
        fillGradient.addColorStop(0, GRAPH_COLORS.fillTop);
        fillGradient.addColorStop(1, GRAPH_COLORS.fillBottom);

        // Draw filled area under line
        ctx.beginPath();
        traceBezierPath();
        ctx.lineTo(points[points.length - 1].x, chartY + chartHeight);
        ctx.lineTo(chartX, chartY + chartHeight);
        ctx.closePath();
        ctx.fillStyle = fillGradient;
        ctx.fill();

        // Vertical gradient for stroke (gold top, purple bottom)
        const strokeGradient = ctx.createLinearGradient(0, chartY, 0, chartY + chartHeight);
        strokeGradient.addColorStop(0, GRAPH_COLORS.lineTop);
        strokeGradient.addColorStop(1, GRAPH_COLORS.lineBottom);

        // Draw main line
        ctx.beginPath();
        traceBezierPath();
        ctx.strokeStyle = strokeGradient;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = GRAPH_COLORS.lineGlow;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.restore(); // Remove clip
      }
    }
  }, [coherenceHistory, smoothedHistory, duration]);

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
    <div className="coherence-graph-lovable">
      {/* Graph canvas */}
      <div className="graph-container-lovable">
        <canvas ref={canvasRef} className="graph-canvas-lovable" />
      </div>

      {/* Time axis */}
      <div className="time-axis-lovable">
        {timeMarkers.map((mins, i) => (
          <span key={i} className="time-marker-lovable">
            {formatTime(mins * 60000)}
          </span>
        ))}
      </div>
    </div>
  );
}
