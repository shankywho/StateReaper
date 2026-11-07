/**
 * src/mock/mock-switch-server.ts
 * Standalone, zero-dependency embedded Switch Protocol server.
 *
 * Implements the official Switch SSE & HTTP REST API specification:
 *  - GET  /rooms/:roomId/events   -> Real Server-Sent Events (SSE) event stream
 *  - POST /rooms/:roomId/messages -> Broadcasts agent/human messages across SSE
 *  - Interactive stdin prompt: Type human messages into the server terminal
 *    to broadcast them directly to connected agents in real time!
 *
 * Enables hackathon judges to test real HTTP/SSE networking locally without
 * requiring the external Go/Rust Switch binary.
 */

import * as http from 'node:http';
import * as readline from 'node:readline';
import type { SwitchRawEvent } from '../types';

const PORT = Number(process.env.SWITCH_PORT ?? 8080);
const HOST = process.env.SWITCH_HOST ?? '127.0.0.1';

// Connected SSE clients by room ID
const roomSubscribers = new Map<string, Set<http.ServerResponse>>();

function broadcastToRoom(roomId: string, event: SwitchRawEvent): void {
  const subscribers = roomSubscribers.get(roomId);
  if (!subscribers || subscribers.size === 0) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of subscribers) {
    try {
      client.write(payload);
    } catch {
      subscribers.delete(client);
    }
  }
}

export function createSwitchServer(): http.Server {
  const server = http.createServer((req, res) => {
    // CORS headers for local testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // Health check endpoint
    if (pathname === '/health' || pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', protocol: 'switch-v1.0' }));
      return;
    }

    // ── GET /rooms/:roomId/events (SSE Stream) ─────────────────────────────
    const sseMatch = pathname.match(/^\/rooms\/([^/]+)\/events$/);
    if (sseMatch && req.method === 'GET') {
      const roomId = sseMatch[1] ?? 'default';

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });

      res.write(`: switch sse connection established for room ${roomId}\n\n`);

      if (!roomSubscribers.has(roomId)) {
        roomSubscribers.set(roomId, new Set());
      }
      const subscribers = roomSubscribers.get(roomId)!;
      subscribers.add(res);

      console.log(`[Switch Server] 📡 Client connected to SSE stream for room: "${roomId}" (Active: ${subscribers.size})`);

      // Heartbeat ping every 15s to keep SSE pipe alive
      const pingTimer = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch {
          clearInterval(pingTimer);
        }
      }, 15_000);

      req.on('close', () => {
        clearInterval(pingTimer);
        subscribers.delete(res);
        console.log(`[Switch Server] 🔌 Client disconnected from room: "${roomId}" (Remaining: ${subscribers.size})`);
      });

      return;
    }

    // ── POST /rooms/:roomId/messages ───────────────────────────────────────
    const msgMatch = pathname.match(/^\/rooms\/([^/]+)\/messages$/);
    if (msgMatch && req.method === 'POST') {
      const roomId = msgMatch[1] ?? 'default';
      let body = '';

      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as {
            sender?: { kind?: 'agent' | 'human'; name?: string };
            content?: string;
          };

          const event: SwitchRawEvent = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'message',
            timestamp: new Date().toISOString(),
            sender: {
              kind: parsed.sender?.kind ?? 'agent',
              name: parsed.sender?.name ?? 'anonymous',
            },
            content: parsed.content ?? '',
            roomId,
          };

          console.log(`[Switch Server] 💬 [Room: ${roomId}] <${event.sender.name} (${event.sender.kind})>: ${event.content}`);

          // Broadcast to all SSE listeners in the room
          broadcastToRoom(roomId, event);

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, eventId: event.id }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });

      return;
    }

    // 404 fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Not found: ${req.method} ${pathname}` }));
  });

  return server;
}

// If executed directly via CLI
if (require.main === module || process.argv[1]?.endsWith('mock-switch-server.ts')) {
  const server = createSwitchServer();
  server.listen(PORT, HOST, () => {
    console.log(`\n================================================================`);
    console.log(`  🚀 Standalone Switch Protocol Server Running`);
    console.log(`  • SSE Endpoint    : http://${HOST}:${PORT}/rooms/:roomId/events`);
    console.log(`  • Message POST    : http://${HOST}:${PORT}/rooms/:roomId/messages`);
    console.log(`  • Default Room ID : statereaper-tribunal`);
    console.log(`================================================================`);
    console.log(`[Switch Server] 💬 Type any message below and press Enter to broadcast as a human:`);
    console.log(`   Example: @executioner-sre approve i-04f8b9a912c1\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      const content = line.trim();
      if (!content) return;

      const event: SwitchRawEvent = {
        id: `human-${Date.now()}`,
        type: 'message',
        timestamp: new Date().toISOString(),
        sender: {
          kind: 'human',
          name: process.env.USER ?? 'sre-operator',
        },
        content,
        roomId: 'statereaper-tribunal',
      };

      console.log(`[Switch Server] 👤 Broadcast human event: "${content}"`);
      broadcastToRoom('statereaper-tribunal', event);
    });
  });
}

