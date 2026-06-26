#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const relayDir = join(repoRoot, 'native', 'brainbit-ios-relay');
const relayBin = join(relayDir, '.build', 'debug', 'brainbit-ios-relay-cli');
const vendorXcframework = join(relayDir, 'Vendor', 'neurosdk2.xcframework');
const vendorMacDylib = join(relayDir, 'Vendor', 'macos', 'libneurosdk2.dylib');
const wsUrl = 'ws://127.0.0.1:8765/ws';
const frameTimeoutMs = Number(process.env.BRAINBIT_IOS_RELAY_FRAME_TIMEOUT_MS ?? 120_000);

function runCommand(name, command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${name} exited with ${signal ?? code}`));
    });
  });
}

function canConnectToRelayPort() {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 8765 });
    socket.setTimeout(250);
    socket.on('connect', () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.on('error', () => resolvePromise(false));
  });
}

async function waitForRelayListening({ timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnectToRelayPort()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for relay on ${wsUrl}`);
}

function validateBrainBitEegJson(raw) {
  if (raw == null || typeof raw !== 'object') throw new Error('not an object');
  if (raw.type !== 'eeg') throw new Error('type !== eeg');
  const { labels, samples, sampleCount, channelCount, timestamp } = raw;
  if (!Array.isArray(labels) || !Array.isArray(samples)) throw new Error('labels/samples not arrays');
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) throw new Error('bad sampleCount');
  if (!Number.isFinite(channelCount) || channelCount <= 0) throw new Error('bad channelCount');
  if (labels.length !== channelCount) throw new Error('labels length mismatch');
  if (samples.length !== channelCount) throw new Error('samples row count mismatch');
  if (labels.join(',') !== 'A1,C3,C4,A2') throw new Error(`unexpected labels: ${labels.join(',')}`);
  for (let ch = 0; ch < channelCount; ch++) {
    const row = samples[ch];
    if (!Array.isArray(row) || row.length !== sampleCount) throw new Error(`samples[${ch}] length`);
    for (const v of row) {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('non-numeric sample');
    }
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) throw new Error('bad timestamp');
  return raw;
}

function waitForValidFrames(count = 3, timeoutMs = frameTimeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const ws = new WebSocket(wsUrl);
    let received = 0;
    const timer = setTimeout(() => {
      ws.close();
      rejectPromise(
        new Error(
          `Only received ${received}/${count} EEG frames within ${timeoutMs}ms. ` +
            'Power on BrainBit Headphones, wear them, and ensure Bluetooth is enabled.',
        ),
      );
    }, timeoutMs);

    ws.on('open', () => console.log('[brainbit-ios-relay-smoke] WebSocket connected'));
    ws.on('message', (data) => {
      try {
        const parsed = validateBrainBitEegJson(JSON.parse(String(data)));
        received += 1;
        console.log(
          `[brainbit-ios-relay-smoke] frame ${received}: channels=${parsed.channelCount} samples=${parsed.sampleCount} labels=${parsed.labels.join(',')}`,
        );
        if (received >= count) {
          clearTimeout(timer);
          ws.close();
          resolvePromise();
        }
      } catch (err) {
        clearTimeout(timer);
        ws.close();
        rejectPromise(err);
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
  });
}

function stopRelay(child) {
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }
}

let relay;

try {
  if (!existsSync(vendorXcframework) || !existsSync(vendorMacDylib)) {
    throw new Error(
      [
        'Missing neurosdk2 vendor files.',
        'Run: ./scripts/setup-neurosdk2-vendor.sh',
      ].join('\n'),
    );
  }

  console.log('[brainbit-ios-relay-smoke] Building relay CLI...');
  await runCommand('swift build', 'swift', ['build'], { cwd: relayDir, stdio: 'pipe' });

  if (!existsSync(relayBin)) {
    throw new Error(`Relay CLI not found after build: ${relayBin}`);
  }

  console.log('[brainbit-ios-relay-smoke] Starting relay (requires BrainBit Headphones nearby)...');
  relay = spawn(relayBin, [], {
    cwd: relayDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line) console.log(`[relay] ${line}`);
    }
  });
  relay.stderr.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line) console.log(`[relay] ${line}`);
    }
  });

  await waitForRelayListening();
  console.log(`[brainbit-ios-relay-smoke] Relay listening — waiting up to ${frameTimeoutMs}ms for real EEG frames...`);
  await waitForValidFrames(3);
  console.log('[brainbit-ios-relay-smoke] OK — real Headphones EEG JSON validated.');
  stopRelay(relay);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  stopRelay(relay);
  process.exit(1);
}
