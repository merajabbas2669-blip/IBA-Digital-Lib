import type { Response } from 'express';

interface SeatBroadcastPayload {
  type: 'seats:updated';
  seatId?: string;
  reason: string;
  timestamp: string;
}

const sseClients = new Set<Response>();

export function registerSeatEventClient(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Initial connected ack event (non-PII)
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, timestamp: new Date().toISOString() })}\n\n`);
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  res.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}

export function broadcastSeatUpdate(reason: string, seatId?: string): void {
  const payload: SeatBroadcastPayload = {
    type: 'seats:updated',
    seatId,
    reason,
    timestamp: new Date().toISOString(),
  };
  const serialized = `event: seats:updated\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(serialized);
    } catch {
      sseClients.delete(client);
    }
  }
}
