#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  buildBrainBitRelay,
  requireBrainBitSdkRoot,
  repoRoot,
  startBrainBitRelay,
  stopBrainBitRelay,
  validateBrainBitSdk,
  waitForBrainBitRelayListening,
} from './brainbit-relay-launcher.mjs';

let sdkRoot;
try {
  sdkRoot = requireBrainBitSdkRoot('npm run dev:brainbit');
  validateBrainBitSdk({ sdkRoot });
  await buildBrainBitRelay({ sdkRoot });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const relay = startBrainBitRelay({ sdkRoot });

let vite;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (vite && !vite.killed) {
    vite.kill('SIGTERM');
  }
  stopBrainBitRelay(relay);
  setTimeout(() => process.exit(code), 250);
}

relay.on('error', (err) => {
  console.error('[dev:brainbit] Relay failed to start:', err);
  shutdown(1);
});

relay.on('exit', (code, signal) => {
  if (!shuttingDown) {
    console.error(`[dev:brainbit] Relay exited unexpectedly with ${signal ?? code}.`);
    shutdown(code ?? 1);
  }
});

try {
  await waitForBrainBitRelayListening(relay, { timeoutMs: 4000 });
  startVite();
} catch {
  if (!shuttingDown) {
    console.warn('[dev:brainbit] Relay listening log not seen yet; starting Vite anyway.');
    startVite();
  }
}

function startVite() {
  if (vite) return;
  console.log('[dev:brainbit] Starting Vite...');
  vite = spawn('npm', ['run', 'dev'], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });

  vite.on('exit', (code) => {
    console.log('[dev:brainbit] Vite exited; stopping BrainBit relay...');
    shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
