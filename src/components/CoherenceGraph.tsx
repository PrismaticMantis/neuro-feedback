// HeartMath-style Coherence Graph Component

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CoherenceGraphProps {
  coherenceHistory: number[];
  currentCoherence: number;
  coherenceZone: 'quiet' | 'stabilizing' | 'noise';
  duration: number; // Current session duration in ms
  isActive: boolean;
}

const ZONE_LABELS = {
  quiet: 'Quiet Power Zone',
  stabilizing: 'Stabilizing',
  noise: 'Low Coherence / Noise',
};

const ZONE_THRESHOLDS = {
  quiet: 0.7,
  stabilizing: 0.4,
};

export function CoherenceGraph({
  coherenceHistory,
  currentCoherence,
  coherenceZone,
  duration,
  isActive,
}: CoherenceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // Draw zone backgrounds
    const quietY = height * (1 - ZONE_THRESHOLDS.quiet);
    const stabilizingY = height * (1 - ZONE_THRESHOLDS.stabilizing);

    // Quiet Power Zone (top)
    ctx.fillStyle = 'rgba(79, 209, 197, 0.15)';
    ctx.fillRect(0, 0, width, quietY);

    // Stabilizing Zone (middle)
    ctx.fillStyle = 'rgba(79, 209, 197, 0.08)';
    ctx.fillRect(0, quietY, width, stabilizingY - quietY);

    // Noise Zone (bottom)
    ctx.fillStyle = 'rgba(79, 209, 197, 0.03)';
    ctx.fillRect(0, stabilizingY, width, height - stabilizingY);

    // Draw zone divider lines
    ctx.strokeStyle = 'rgba(79, 209, 197, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(0, quietY);
    ctx.lineTo(width, quietY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, stabilizingY);
    ctx.lineTo(width, stabilizingY);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw coherence line
    if (coherenceHistory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const pointSpacing = width / Math.max(coherenceHistory.length - 1, 1);

      coherenceHistory.forEach((value, index) => {
        const x = index * pointSpacing;
        const y = height * (1 - value);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw glow effect on the line
      ctx.strokeStyle = 'rgba(79, 209, 197, 0.5)';
      ctx.lineWidth = 6;
      ctx.filter = 'blur(4px)';
      ctx.stroke();
      ctx.filter = 'none';
    }
  }, [coherenceHistory]);

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
      {/* Zone labels */}
      <div className="zone-labels">
        <span className={`zone-label ${coherenceZone === 'quiet' ? 'active' : ''}`}>
          {ZONE_LABELS.quiet}
        </span>
        <span className={`zone-label ${coherenceZone === 'stabilizing' ? 'active' : ''}`}>
          {ZONE_LABELS.stabilizing}
        </span>
        <span className={`zone-label ${coherenceZone === 'noise' ? 'active' : ''}`}>
          {ZONE_LABELS.noise}
        </span>
      </div>

      {/* Graph canvas */}
      <div className="graph-container">
        <canvas ref={canvasRef} className="graph-canvas" />

        {/* Current position indicator */}
        {isActive && (
          <motion.div
            className="current-indicator"
            style={{
              top: `${(1 - currentCoherence) * 100}%`,
              right: 0,
            }}
            animate={{
              scale: [1, 1.3, 1],
              boxShadow: [
                '0 0 10px rgba(79, 209, 197, 0.5)',
                '0 0 20px rgba(79, 209, 197, 0.8)',
                '0 0 10px rgba(79, 209, 197, 0.5)',
              ],
            }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}
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
