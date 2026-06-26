#!/usr/bin/env node

import {
  buildBrainBitRelay,
  requireBrainBitSdkRoot,
  startBrainBitRelay,
  stopBrainBitRelay,
  validateBrainBitSdk,
  waitForBrainBitRelayListening,
} from './brainbit-relay-launcher.mjs';

let relay;

try {
  const sdkRoot = requireBrainBitSdkRoot('node scripts/brainbit-relay-smoke.mjs');
  validateBrainBitSdk({ sdkRoot });
  await buildBrainBitRelay({ sdkRoot });

  relay = startBrainBitRelay({ sdkRoot });
  await waitForBrainBitRelayListening(relay, { timeoutMs: 15000 });
  console.log('[brainbit-relay-smoke] Relay reached listening state. Stopping cleanly.');
  stopBrainBitRelay(relay);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  stopBrainBitRelay(relay);
  process.exit(1);
}
