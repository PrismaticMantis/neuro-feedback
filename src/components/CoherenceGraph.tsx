// HeartMath-style Coherence Graph Component

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface CoherenceGraphProps {
  coherenceHistory: number[];
  currentCoherence: number;
  coherenceZone: 'flow' | 'stabilizing' | 'noise';
  duration: number; // Current session duration in ms
  isActive: boolean;
}

// Zone configuration with labels, descriptions, and colors
const ZONE_CONFIG = {
  flow: {
    label: 'Coherence',
    description: 'Calm & Focused',
    color: 'var(--accent-teal)',
    bgColor: 'rgba(79, 209, 197, 0.15)',
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

// Centralized coordinate mapping function (used by both graph and ball)
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
  currentCoherence,
  coherenceZone,
  duration,
  isActive,
}: CoherenceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ballY, setBallY] = useState(0);
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

  // Update ball position using same coordinate system as graph
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const height = rect.height;
    
    // Use the same mapping function as the graph
    const y = mapValueToY(currentCoherence, height);
    
    // Convert to percentage for CSS positioning
    const yPercent = (y / height) * 100;
    setBallY(yPercent);
  }, [currentCoherence]);

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

    // Draw zone backgrounds with distinct colors
    const flowY = height * (1 - ZONE_THRESHOLDS.flow);
    const stabilizingY = height * (1 - ZONE_THRESHOLDS.stabilizing);

    // Coherence Zone (top) - green tint
    ctx.fillStyle = 'rgba(79, 209, 197, 0.12)';
    ctx.fillRect(0, 0, width, flowY);

    // Stabilizing Zone (middle) - yellow tint
    ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
    ctx.fillRect(0, flowY, width, stabilizingY - flowY);

    // Active Mind Zone (bottom) - red tint
    ctx.fillStyle = 'rgba(248, 113, 113, 0.06)';
    ctx.fillRect(0, stabilizingY, width, height - stabilizingY);

    // Draw zone divider lines
    ctx.strokeStyle = 'rgba(79, 209, 197, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(0, flowY);
    ctx.lineTo(width, flowY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
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
      
      // Draw glow effect first (behind the line)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(79, 209, 197, 0.4)';
      ctx.lineWidth = lineWidth + 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(79, 209, 197, 0.6)';

      const pointSpacing = width / Math.max(historyToDraw.length - 1, 1);

      historyToDraw.forEach((value, index) => {
        const x = index * pointSpacing;
        const y = mapValueToY(value, height);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Draw main line on top
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      historyToDraw.forEach((value, index) => {
        const x = index * pointSpacing;
        const y = mapValueToY(value, height);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw last point marker for debugging alignment (small dot)
      if (historyToDraw.length > 0) {
        const lastValue = historyToDraw[historyToDraw.length - 1];
        const lastX = (historyToDraw.length - 1) * pointSpacing;
        const lastY = mapValueToY(lastValue, height);
        
        ctx.fillStyle = 'rgba(79, 209, 197, 0.8)';
        ctx.beginPath();
        ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
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

  const currentZoneConfig = ZONE_CONFIG[coherenceZone];

  return (
    <div className="coherence-graph">
      {/* Current State Badge */}
      <motion.div 
        className="current-state-badge"
        style={{ 
          backgroundColor: `${currentZoneConfig.color}15`,
          borderColor: currentZoneConfig.color,
          color: currentZoneConfig.color,
        }}
        key={coherenceZone}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <span className="state-icon">{currentZoneConfig.icon}</span>
        <span className="state-label">{currentZoneConfig.label}</span>
        <span className="state-desc">{currentZoneConfig.description}</span>
      </motion.div>

      {/* Zone labels with icons */}
      <div className="zone-labels">
        {(['flow', 'stabilizing', 'noise'] as const).map((zone) => {
          const config = ZONE_CONFIG[zone];
          const isActive = coherenceZone === zone;
          
          return (
            <motion.div 
              key={zone}
              className={`zone-label ${isActive ? 'active' : ''}`}
              style={{ 
                borderLeftColor: isActive ? config.color : 'transparent',
                backgroundColor: isActive ? config.bgColor : 'transparent',
              }}
              animate={isActive ? { 
                opacity: [0.8, 1, 0.8],
              } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <span className="zone-icon" style={{ color: config.color }}>
                {config.icon}
              </span>
              <div className="zone-text">
                <span className="zone-name">{config.label}</span>
                <span className="zone-desc">{config.description}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} className="graph-container">
        <canvas ref={canvasRef} className="graph-canvas" />

        {/* Current position indicator - uses same coordinate mapping as graph */}
        {isActive && (
          <motion.div
            className="current-indicator"
            style={{
              top: `${ballY}%`,
              right: 0,
              backgroundColor: currentZoneConfig.color,
            }}
            animate={{
              scale: [1, 1.2, 1],
              boxShadow: [
                `0 0 12px ${currentZoneConfig.color}80`,
                `0 0 24px ${currentZoneConfig.color}cc`,
                `0 0 12px ${currentZoneConfig.color}80`,
              ],
            }}
            transition={{ 
              repeat: Infinity, 
              duration: 1.5,
            }}
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
