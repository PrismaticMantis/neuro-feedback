#!/usr/bin/env node
/**
 * Temporary WebSocket relay for Athena iOS → NeuroFlo dev page.
 * - Listens on 0.0.0.0:8765 (all interfaces) so a phone can reach your Mac via LAN IP.
 * - Any message from one client is broadcast to all other connected clients.
 *
 * Run: npm run athena-bridge
 * Then open: http://localhost:5173/athena-bridge-dev.html (with `npm run dev`)
 */

import { WebSocketServer } from 'ws';

const PORT = Number(process.env.ATHENA_BRIDGE_PORT) || 8765;

const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT });

wss.on('connection', (ws, req) => {
  const from = req.socket.remoteAddress ?? '?';
  console.log(`[athena-bridge] client connected from ${from} (total ${wss.clients.size})`);

  ws.on('message', (data, isBinary) => {
    const payload = isBinary ? data : data.toString();
    let n = 0;
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(payload, { binary: isBinary });
        n++;
      }
    }
    if (n > 0) {
      console.log(`[athena-bridge] relayed ${isBinary ? 'binary' : 'text'} to ${n} peer(s)`);
    }
  });

  ws.on('close', () => {
    console.log(`[athena-bridge] client disconnected (total ${wss.clients.size})`);
  });
});

wss.on('listening', () => {
  console.log(`[athena-bridge] WebSocket relay listening on ws://0.0.0.0:${PORT}`);
  console.log(`[athena-bridge] NeuroFlo: open /athena-bridge-dev.html and connect to ws://localhost:${PORT}`);
  console.log(`[athena-bridge] iOS: connect to ws://<this-mac-lan-ip>:${PORT}`);
});
