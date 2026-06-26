import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(__dirname, '..');
export const relayDir = join(repoRoot, 'native', 'brainbit-capsule-relay');
export const relayBin = join(relayDir, '.build', 'x86_64-apple-macosx', 'debug', 'brainbit-capsule-relay');
export const relayListeningLogs = [
  '[WS server] listening',
  'WebSocket server (SwiftNIO): ws://127.0.0.1:8765/ws',
];

export function requireBrainBitSdkRoot(exampleCommand = 'npm run dev:brainbit') {
  const sdkRoot = process.env.BRAINBIT_CAPSULE_SDK_ROOT;
  if (!sdkRoot) {
    throw new Error(
      [
        'Missing BRAINBIT_CAPSULE_SDK_ROOT.',
        `Example: BRAINBIT_CAPSULE_SDK_ROOT="/path/to/capsule-public-v1.5.0/CapsuleAPI/Mac" ${exampleCommand}`,
      ].join('\n'),
    );
  }
  return sdkRoot;
}

export function validateBrainBitSdk({ sdkRoot }) {
  const capsuleDylib = join(sdkRoot, 'libCapsuleClient.dylib');
  const capsuleHeader = join(sdkRoot, 'Include', 'Capsule', 'CClient.h');

  if (!existsSync(capsuleDylib)) {
    throw new Error(`Missing Capsule dylib: ${capsuleDylib}`);
  }

  if (!existsSync(capsuleHeader)) {
    throw new Error(`Missing Capsule headers: ${capsuleHeader}`);
  }

  return { capsuleDylib, capsuleHeader };
}

export function runCommand(name, command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`${name} exited with ${signal ?? code}`));
      }
    });
  });
}

export async function buildBrainBitRelay({ sdkRoot }) {
  console.log('[brainbit-relay] Building BrainBit relay (x86_64)...');
  await runCommand('swift build', 'swift', ['build', '--arch', 'x86_64'], {
    cwd: relayDir,
    env: {
      ...process.env,
      BRAINBIT_CAPSULE_SDK_ROOT: sdkRoot,
    },
  });

  if (!existsSync(relayBin)) {
    throw new Error(`Relay build completed, but executable was not found: ${relayBin}`);
  }

  return relayBin;
}

export function createBrainBitRelayEnv({ sdkRoot }) {
  return {
    ...process.env,
    BRAINBIT_CAPSULE_SDK_ROOT: sdkRoot,
    DYLD_LIBRARY_PATH: process.env.DYLD_LIBRARY_PATH
      ? `${sdkRoot}:${process.env.DYLD_LIBRARY_PATH}`
      : sdkRoot,
  };
}

export function prefixStream(stream, label) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.length > 0) {
        console.log(`[${label}] ${line}`);
      }
    }
  });
}

export function startBrainBitRelay({ sdkRoot, prefixLogs = true } = {}) {
  if (!existsSync(relayBin)) {
    throw new Error(`BrainBit relay executable not found. Build it first: ${relayBin}`);
  }

  console.log('[brainbit-relay] Starting BrainBit relay...');
  const child = spawn(relayBin, [], {
    cwd: relayDir,
    env: createBrainBitRelayEnv({ sdkRoot }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (prefixLogs) {
    prefixStream(child.stdout, 'relay');
    prefixStream(child.stderr, 'relay');
  }

  return child;
}

function hasRelayListeningLog(chunk) {
  const text = String(chunk);
  return relayListeningLogs.some((line) => text.includes(line));
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

export function waitForBrainBitRelayListening(child, { timeoutMs = 10000 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const poll = setInterval(async () => {
      if (settled) return;
      if (await canConnectToRelayPort()) {
        settled = true;
        cleanup();
        resolvePromise();
      }
    }, 250);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(new Error(`Timed out waiting for relay listening log after ${timeoutMs}ms.`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      clearInterval(poll);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onOutput);
      child.off('exit', onExit);
      child.off('error', onError);
    }

    function onStdout(chunk) {
      onOutput(chunk);
    }

    function onOutput(chunk) {
      if (hasRelayListeningLog(chunk)) {
        settled = true;
        cleanup();
        resolvePromise();
      }
    }

    function onExit(code, signal) {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(new Error(`Relay exited before listening with ${signal ?? code}.`));
    }

    function onError(err) {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(err);
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onOutput);
    child.on('exit', onExit);
    child.on('error', onError);
  });
}

export function stopBrainBitRelay(child, signal = 'SIGTERM') {
  if (!child || child.killed) return;
  child.kill(signal);
}
