// HeartMath-style Coherence Graph Component

import { useRef, useEffect } from 'react';
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
      <div className="graph-container">
        <canvas ref={canvasRef} className="graph-canvas" />

        {/* Current position indicator */}
        {isActive && (
          <motion.div
            className="current-indicator"
            style={{
              top: `${(1 - currentCoherence) * 100}%`,
              right: 0,
              backgroundColor: currentZoneConfig.color,
            }}
            animate={{
              scale: [1, 1.3, 1],
              boxShadow: [
                `0 0 10px ${currentZoneConfig.color}80`,
                `0 0 20px ${currentZoneConfig.color}cc`,
                `0 0 10px ${currentZoneConfig.color}80`,
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
