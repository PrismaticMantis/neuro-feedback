/**
 * BrainBit Capsule WebSocket — detector + coherence diagnostics.
 * Rendered only when `isBrainBitBridgeEEGDevice` (setup + in-session).
 */

import type { ReactNode } from 'react';
import type { AthenaCoherenceDebugSnapshot, BrainwaveBands, BrainwaveBandsDb } from '../types';

function pass(ok: boolean): string {
  return ok ? '✓' : '✗';
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid hsl(200 30% 22% / 0.7)' }}>
      <div style={{ fontWeight: 600, color: 'hsl(195 65% 70%)', marginBottom: '5px', fontSize: '10px' }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '11.5em 1fr', gap: '6px', alignItems: 'start', marginBottom: '3px' }}>
      <span style={{ color: 'hsl(200 15% 55%)' }}>{label}</span>
      <span style={{ color: 'var(--text-muted)', wordBreak: 'break-word' }}>{children}</span>
    </div>
  );
}

function fmtBands(bands: BrainwaveBands | null | undefined): string {
  return bands
    ? `δ ${bands.delta.toFixed(3)} θ ${bands.theta.toFixed(3)} α ${bands.alpha.toFixed(3)} β ${bands.beta.toFixed(3)} γ ${bands.gamma.toFixed(3)}`
    : '—';
}

function fmtBandsDb(bands: BrainwaveBandsDb | null | undefined): string {
  return bands
    ? `δ ${bands.delta.toFixed(0)} θ ${bands.theta.toFixed(0)} α ${bands.alpha.toFixed(0)} β ${bands.beta.toFixed(0)} γ ${bands.gamma.toFixed(0)}`
    : '—';
}

export function BrainBitCoherenceDebugPanel({
  debug,
  variant = 'setup',
}: {
  debug: AthenaCoherenceDebugSnapshot;
  variant?: 'setup' | 'session';
}) {
  const x = debug.brainBitExtras;
  const b = debug.bandsSmooth;
  const alphaDet = debug.bandsAlphaForValidity ?? b.alpha;
  const betaDet = b.beta;
  const sigAlphaMin = debug.signalValidMinAlpha;
  const hasSigAlpha = sigAlphaMin != null && alphaDet >= sigAlphaMin;
  const floorMin = debug.alphaFloorMin;
  const ceilingMax = debug.alphaCeilingMax;
  const smoothed = debug.smoothedAlphaPower;
  const hasFloor = floorMin == null || smoothed == null ? null : smoothed >= floorMin;
  const hasCeiling = debug.hasAlphaCeiling ?? true;
  const varOkSig = debug.signalVariance >= debug.minVariance;
  const varOkCond = debug.signalVariance < debug.varianceThreshold;
  const betaAlphaOk = debug.betaAlphaRatio < debug.betaAlphaRatioThreshold;
  const noiseOk = debug.noiseLevel < debug.noiseThreshold;
  const hasMinPower = debug.totalBandPower >= debug.minSignalPower;
  const uiFlowBand = debug.coherenceZone === 'flow';
  const gammaThetaRatio =
    b.theta > 1e-9 ? (b.gamma / b.theta).toFixed(3) : b.gamma > 1e-9 ? '∞' : '—';
  const hs = debug.brainBitElectrodeHorseshoe;
  const isSession = variant === 'session';
  const audit = debug.brainBitAudit;
  const contactChannels = audit?.contactPerChannel ?? [];
  const weakContactChannels = contactChannels.filter((ch) => ch.horseshoe >= 3);

  const wrap =
    isSession
      ? {
          position: 'fixed' as const,
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 999,
          width: 'min(560px, 50vw)',
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: '100vh',
          overflowY: 'auto' as const,
          marginTop: 0,
        }
      : {
          marginTop: 0,
          maxHeight: 'none' as const,
          overflowY: 'visible' as const,
          width: '100%',
        };

  const coreAndSignalSections = (
    <>
      <Section title="1 · Core coherence state">
        <Row label="coherence (UI)">{debug.coherence.toFixed(3)}</Row>
        {debug.brainBitCoherenceRaw != null ? (
          <Row label="coherence raw">
            {debug.brainBitCoherenceRaw.toFixed(3)}
            {debug.brainBitCoherenceScoreScale != null
              ? ` × ${debug.brainBitCoherenceScoreScale} → UI`
              : ''}
          </Row>
        ) : null}
        <Row label="zone (UI)">{debug.coherenceZone}</Row>
        <Row label="UI flow band">
          {String(uiFlowBand)} (coh ≥ {debug.uiFlowThreshold.toFixed(2)}) {pass(uiFlowBand)}
        </Row>
        <Row label="detector flow">{String(debug.flowActive)} (dwell sustained → isActive) {pass(debug.flowActive)}</Row>
        <Row label="dwell blocker">
          {debug.dwellBlocker ? (
            <span style={{ color: 'hsl(35 80% 62%)' }}>{debug.dwellBlocker}</span>
          ) : (
            <span style={{ color: 'hsl(140 40% 55%)' }}>none</span>
          )}
        </Row>
        <Row label="signalValid">{String(debug.signalValid)} {pass(debug.signalValid)}</Row>
        <Row label="condMet">
          {String(debug.conditionsMet)} {pass(debug.conditionsMet)}
          {debug.conditionsMetRaw === false && debug.dwellGraceActive
            ? ` · grace holding (${debug.conditionBreakGraceMs ?? 0}ms)`
            : ''}
        </Row>
        {debug.conditionsMetRaw != null && debug.conditionsMetRaw !== debug.conditionsMet ? (
          <Row label="strict condMet">{String(debug.conditionsMetRaw)} {pass(debug.conditionsMetRaw)}</Row>
        ) : null}
        <Row label="path">{debug.coherencePath} · {debug.pathDetail}</Row>
        <Row label="flow edge (2.5s)">{debug.flowEdge}</Row>
      </Section>

      <Section title="2 · Alpha & 15s baseline floor">
        <Row label="α (detector)">{alphaDet.toFixed(4)}</Row>
        {audit ? (
          <>
            <Row label="α rel all / C3C4">
              {audit.allBands?.alpha.toFixed(4) ?? '—'} / {audit.corticalBands?.alpha.toFixed(4) ?? '—'}
            </Row>
            <Row label="α dB all / C3C4">
              {audit.allBandsDb?.alpha.toFixed(0) ?? '—'} / {audit.corticalBandsDb?.alpha.toFixed(0) ?? '—'}
            </Row>
            <Row label="band labels">
              all [{audit.allLabels.join(', ') || '—'}] · selected [{audit.selectedLabels.join(', ') || '—'}]
            </Row>
          </>
        ) : null}
        <Row label="sigValid α min">{sigAlphaMin?.toFixed(4) ?? '—'} {pass(hasSigAlpha)}</Row>
        <Row label="baseline α μ (15s)">
          {debug.alphaBaselinePower != null ? debug.alphaBaselinePower.toFixed(4) : '… (warming)'}
        </Row>
        <Row label="baseline window done">
          {String(debug.alphaBaselineWindowComplete)} {pass(Boolean(debug.alphaBaselineWindowComplete))}
        </Row>
        <Row label="smoothed α (EMA)">{smoothed != null ? smoothed.toFixed(4) : '—'}</Row>
        <Row label="smoothed ≥ α floor min">
          {hasFloor == null ? '— (no baseline yet)' : pass(hasFloor)}
        </Row>
        <Row label="α floor min">{floorMin != null ? floorMin.toFixed(4) : '—'}</Row>
        <Row label="α floor ratio">{(debug.alphaFloorBaselineRatio ?? 0.5).toFixed(2)} of baseline μ</Row>
        <Row label="hasAlphaFloor">{String(debug.hasAlphaFloor)} {pass(debug.hasAlphaFloor)}</Row>
        {ceilingMax != null ? (
          <>
            <Row label="α spike max">{ceilingMax.toFixed(4)}</Row>
            <Row label="hasAlphaCeiling">{String(hasCeiling)} {pass(hasCeiling)}</Row>
          </>
        ) : null}
      </Section>

      <Section title="3 · Beta, variance, noise">
        <Row label="β (detector)">{betaDet.toFixed(4)}</Row>
        <Row label="β/α">
          {debug.betaAlphaRatio.toFixed(3)} &lt; {debug.betaAlphaRatioThreshold.toFixed(3)} {pass(betaAlphaOk)}
        </Row>
        <Row label="var (α+β window)">{debug.signalVariance.toExponential(4)}</Row>
        <Row label="sigValid var min">{debug.minVariance.toExponential(4)} {pass(varOkSig)}</Row>
        <Row label="dwell var max">{debug.varianceThreshold.toFixed(3)} (cond: var below) {pass(varOkCond)}</Row>
        <Row label="noise">{debug.noiseLevel.toFixed(4)}</Row>
        <Row label="noise max">{debug.noiseThreshold.toFixed(2)} {pass(noiseOk)}</Row>
        {debug.brainBitContactArtifact01 != null ? (
          <Row label="contact artifact">
            {debug.brainBitContactArtifact01.toFixed(3)} (BrainBit synthetic motion)
          </Row>
        ) : null}
        <Row label="motion norm / raw">
          {debug.normalizedMotion.toFixed(3)} / {debug.motionRaw.toFixed(2)} (BrainBit norm includes contact artifact)
        </Row>
      </Section>
    </>
  );

  const contactAndRewardSections = (
    <>
      <Section title="4 · Contact & signal trust">
        <Row label="electrodeQ (dwell)">{debug.electrodeQuality.toFixed(3)}</Row>
        <Row label="conn metric (UI)">{debug.connectionQualityMetric.toFixed(3)}</Row>
        <Row label="touching">{String(debug.touching)}</Row>
        <Row label="Σ band power">{debug.totalBandPower.toFixed(3)} ≥ min {debug.minSignalPower} {pass(hasMinPower)}</Row>
        <Row label="horseshoe [ch…]">
          {hs && hs.length > 0 ? `[${hs.join(', ')}] (1=good…4=off)` : '—'}
        </Row>
        {weakContactChannels.length > 0 ? (
          <Row label="drop reasons">
            {weakContactChannels
              .map((ch) => `${ch.label}:hs${ch.horseshoe} ${ch.rule}`)
              .join(' | ')}
          </Row>
        ) : contactChannels.length > 0 ? (
          <Row label="drop reasons">none · all channels medium/good</Row>
        ) : null}
        {contactChannels.length > 0 ? (
          <Row label="contact ch stats">
            {contactChannels
              .map((ch) => `${ch.label}:hs${ch.horseshoe} abs${ch.absAmp.toFixed(0)} var${ch.variance.toFixed(0)}`)
              .join(' | ')}
          </Row>
        ) : null}
        <Row label="relay gap">
          {x ? (
            <>
              {Math.round(x.timeSinceLastUpdateMs)} ms
              {x.timeSinceLastUpdateMs > 2000 ? (
                <span style={{ color: 'hsl(35 85% 58%)' }}> · stall risk</span>
              ) : null}
            </>
          ) : (
            '—'
          )}
        </Row>
        <Row label="audio SM contact">{debug.audioContactAvg.toFixed(2)} · sigOk {String(debug.audioSignalOkForStateMachine)}</Row>
      </Section>

      <Section title="5 · Artifact hints (movement / jaw)">
        <Row label="γ (det)">{b.gamma.toFixed(4)}</Row>
        <Row label="θ (det)">{b.theta.toFixed(4)}</Row>
        <Row label="γ/θ">{gammaThetaRatio} (spike often = muscle / motion)</Row>
        <Row label="δ θ α β γ">
          {b.delta.toFixed(3)} {b.theta.toFixed(3)} {b.alpha.toFixed(3)} {b.beta.toFixed(3)} {b.gamma.toFixed(3)}
        </Row>
        {x ? (
          <>
            <Row label="chunk seq">{x.relayChunkSeq ?? '—'}</Row>
            <Row label="accepted pkts">{x.relayAcceptedTotal}</Row>
            <Row label="FFT nominal">{x.fftNominalHz} Hz</Row>
            <Row label="chunk implied">{x.chunkImpliedHz != null ? `${x.chunkImpliedHz.toFixed(0)} Hz` : '—'}</Row>
          </>
        ) : (
          <Row label="relay extras">—</Row>
        )}
      </Section>

      <Section title="6 · Dwell & reward">
        <Row label="dwell ms">{debug.sustainedMs} / {debug.sustainedTargetMs} required</Row>
        <Row label="dwell %">{(debug.dwellProgress * 100).toFixed(0)}%</Row>
        <Row label="gap → audio SM">{debug.gapToAudioSmEnter.toFixed(3)} (need ≤0) @ enter {debug.audioSmEnterThreshold.toFixed(2)}</Row>
        <Row label="gap → UI flow">{debug.gapToUiFlow.toFixed(3)} @ {debug.uiFlowThreshold.toFixed(2)}</Row>
        <Row label="bottleneck">
          <span style={{ color: 'hsl(190 48% 68%)' }}>{debug.bottleneckHint}</span>
        </Row>
        {debug.audioReward ? (
          <>
            <Row label="audio SM state">{debug.audioReward.audioSmState}</Row>
            <Row label="SM stab hold">
              {(debug.audioReward.smEnterSustainProgress01 * 100).toFixed(0)}% / {debug.audioReward.smEnterSustainTargetSec.toFixed(2)}s
            </Row>
            <Row label="reward hint">{debug.audioReward.rewardPathHint}</Row>
          </>
        ) : (
          <Row label="audio reward">— (no AudioContext)</Row>
        )}
      </Section>

      {debug.useRelativeMode ? (
        <Section title="Easy · relative calibration">
          <Row label="baselineCal">{String(debug.baselineCalComplete)}</Row>
          <Row label="relMode">{String(debug.useRelativeMode)}</Row>
          {debug.relativeGate ? (
            <Row label="rel gates">
              β/α≤{debug.relativeGate.betaAlphaMax.toFixed(2)} {pass(debug.relativeGate.betaAlphaOk)} · var≤
              {debug.relativeGate.varianceMax.toFixed(3)} {pass(debug.relativeGate.varianceOk)} · α≥
              {debug.relativeGate.alphaMin.toFixed(3)} {pass(debug.relativeGate.alphaOk)}
            </Row>
          ) : debug.pathDetail === 'absolute-prebaseline' ? (
            <Row label="relative">calibrating — still absolute thresholds</Row>
          ) : null}
        </Section>
      ) : null}

      {audit?.enabled ? (
        <Section title="Audit · raw BrainBit signal">
          <Row label="mode">AUDIT: dwell grace / α ceiling / contact cap / score scaling off</Row>
          <Row label="all labels">{audit.allLabels.length > 0 ? audit.allLabels.join(', ') : '—'}</Row>
          <Row label="C3/C4 labels">{audit.selectedLabels.length > 0 ? audit.selectedLabels.join(', ') : '—'}</Row>
          <Row label="all rel bands">{fmtBands(audit.allBands)}</Row>
          <Row label="C3/C4 rel bands">{fmtBands(audit.corticalBands)}</Row>
          <Row label="all dB bands">{fmtBandsDb(audit.allBandsDb)}</Row>
          <Row label="C3/C4 dB bands">{fmtBandsDb(audit.corticalBandsDb)}</Row>
          <Row label="audit α / β:α">
            {(audit.corticalBands?.alpha ?? b.alpha).toFixed(4)} / {debug.betaAlphaRatio.toFixed(3)}
          </Row>
          <Row label="audit γ/θ">{gammaThetaRatio}</Row>
          <Row label="contact artifact">{debug.brainBitContactArtifact01?.toFixed(3) ?? '—'} (reported only; not gating)</Row>
          {audit.contactPerChannel.length > 0 ? (
            <Row label="contact ch">
              {audit.contactPerChannel
                .map((ch) => `${ch.label}:hs${ch.horseshoe} abs${ch.absAmp.toFixed(0)} var${ch.variance.toFixed(0)} ${ch.rule}`)
                .join(' | ')}
            </Row>
          ) : null}
          {x ? <Row label="relay gap">{Math.round(x.timeSinceLastUpdateMs)} ms</Row> : null}
        </Section>
      ) : null}
    </>
  );

  return (
    <div
      className="brainbit-coherence-debug-overlay"
      style={{
        ...wrap,
        padding: '10px 12px',
        borderRadius: isSession ? '0 10px 10px 0' : '8px',
        background: 'hsl(200 35% 10% / 0.94)',
        border: '1px solid hsl(200 40% 28% / 0.55)',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '10px',
        lineHeight: 1.4,
        color: 'var(--text-muted)',
        boxShadow: '0 4px 24px hsl(0 0% 0% / 0.35)',
      }}
    >
      <div style={{ fontWeight: 700, color: 'hsl(195 72% 74%)', marginBottom: '2px' }}>
        BrainBit · coherence & detector
      </div>
      <div style={{ fontSize: '9px', opacity: 0.85, marginBottom: '4px' }}>
        {variant === 'session' ? 'In-session' : 'Setup'} · `VITE_DEBUG_BRAINBIT_BRIDGE` · detector bands = `getCoherenceDetectorBands()`
      </div>

      {isSession ? (
        <>
          {coreAndSignalSections}
          {contactAndRewardSections}
        </>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            columnGap: '18px',
            alignItems: 'start',
          }}
        >
          <div>{coreAndSignalSections}</div>
          <div>{contactAndRewardSections}</div>
        </div>
      )}

      <div style={{ marginTop: '8px', fontSize: '9px', opacity: 0.75 }}>
        detectorFlowEver {String(debug.detectorFlowEver)} · detActive~{debug.detectorActiveSec.toFixed(1)}s
      </div>
    </div>
  );
}
