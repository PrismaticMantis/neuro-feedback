import { motion } from 'framer-motion';
import type { BrainBitContactStabilizationState } from '../hooks/useBrainBitContactStabilization';

interface BrainBitContactStabilizationProps {
  state: BrainBitContactStabilizationState;
}

export function BrainBitContactStabilization({ state }: BrainBitContactStabilizationProps) {
  const progress = Math.min(1, state.stableMs / state.holdMs);
  const ready = state.isReady;

  return (
    <div
      style={{
        marginTop: 14,
        padding: '14px 16px',
        borderRadius: 10,
        background: ready
          ? 'hsl(145 35% 14% / 0.55)'
          : 'hsl(210 35% 14% / 0.45)',
        border: ready
          ? '1px solid hsl(145 40% 32% / 0.5)'
          : '1px solid hsl(210 35% 28% / 0.45)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: ready ? '#86efac' : 'var(--text-primary)',
          }}
        >
          {ready ? 'On-head contact stable — ready to begin' : 'Checking on-head contact'}
        </span>
        {!ready && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
            }}
          >
            {Math.round(progress * 100)}%
          </span>
        )}
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: 'hsl(270 10% 18%)',
          overflow: 'hidden',
          marginBottom: state.hint ? 10 : 0,
        }}
      >
        <motion.div
          initial={false}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            height: '100%',
            borderRadius: 999,
            background: ready
              ? 'linear-gradient(90deg, #22c55e, #86efac)'
              : 'linear-gradient(90deg, #60a5fa, #93c5fd)',
          }}
        />
      </div>

      {state.hint && (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            lineHeight: 1.45,
            color: state.c3c4Weak ? 'hsl(40 90% 72%)' : 'var(--text-muted)',
            fontWeight: state.c3c4Weak ? 500 : 400,
          }}
        >
          {state.hint}
        </p>
      )}
    </div>
  );
}
