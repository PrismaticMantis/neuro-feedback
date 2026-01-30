// HeartMath-style Coherence Graph Component

import { useRef, useEffect, useState } from 'react';

interface CoherenceGraphProps {
  coherenceHistory: number[];
  coherenceZone: 'flow' | 'stabilizing' | 'noise';
  duration: number; // Current session duration in ms
}

// Zone thresholds removed - not used in Lovable design (clean background)

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
  coherenceZone: _coherenceZone,
  duration,
}: CoherenceGraphProps) {
  void _coherenceZone; // Keep prop for API compatibility but not used in Lovable design
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

    // No zone backgrounds in Lovable design - clean dark background

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

      // Draw smooth bezier curve with gradient (purple to gold)
      if (points.length >= 2) {
        // Create gradient for stroke (purple to gold)
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#9e59b8'); // Purple (accent-secondary)
        gradient.addColorStop(1, '#dfc58b'); // Gold (accent-primary)

        // Draw filled area under line first
        ctx.beginPath();
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
        
        // Close path for fill
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        // Fill with gradient
        const fillGradient = ctx.createLinearGradient(0, 0, width, 0);
        fillGradient.addColorStop(0, 'rgba(158, 89, 184, 0.3)'); // Purple with opacity
        fillGradient.addColorStop(1, 'rgba(223, 197, 139, 0.2)'); // Gold with opacity
        ctx.fillStyle = fillGradient;
        ctx.fill();

        // Draw main line with gradient
        ctx.beginPath();
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

        ctx.strokeStyle = gradient;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(223, 197, 139, 0.4)';
        ctx.stroke();
        ctx.shadowBlur = 0;
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
