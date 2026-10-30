// Limits are per process. An edge/shared limiter is still needed across replicas.
export class CapacityGate {
  constructor(limit) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid capacity');
    this.limit = limit;
    this.active = 0;
  }
  acquire() {
    if (this.active >= this.limit) return null;
    this.active++;
    let released = false;
    return () => { if (!released) { released = true; this.active--; } };
  }
}

export function positiveLimit(value, fallback) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

const eventGate = new CapacityGate(positiveLimit(process.env.CHAT_MAX_SOCKET_WORK, 128));
const socketWork = new WeakMap();
export function registerChatEvent(socket, event, handler) {
  socket.on(event, async (...args) => {
    const active = socketWork.get(socket) || 0;
    const release = active < 4 ? eventGate.acquire() : null;
    if (!release) {
      // No deferred queue: the client must retry durable actions through HTTP.
      return;
    }
    socketWork.set(socket, active + 1);
    try { await handler(...args); }
    catch (error) { console.error(`Chat event failed: ${event}`, error); }
    finally { socketWork.set(socket, (socketWork.get(socket) || 1) - 1); release(); }
  });
}

// Socket-local state is reclaimed on disconnect; no unbounded global user map.
export function installSocketBudget(socket, { rate = 40, burst = 80, now = Date.now } = {}) {
  let tokens = burst;
  let at = now();
  let reportedAt = -Infinity;
  const typingAt = new Map();
  socket.use(([event, payload], next) => {
    const time = now();
    tokens = Math.min(burst, tokens + Math.max(0, time - at) * rate / 1000);
    at = time;
    if (tokens < 1) {
      if (time - reportedAt >= 1000) {
        socket.emit('chat_backpressure', { code: 'RATE_LIMITED', retryAfterMs: 1000 });
        reportedAt = time;
      }
      return; // Drop before any DB-backed event handler runs.
    }
    tokens--;
    if (event === 'typing_start' || event === 'typing_stop' || event === 'group_typing') {
      const target = event === 'group_typing' ? payload?.groupId : payload?.receiverId;
      if (!Number.isSafeInteger(Number(target)) || Number(target) <= 0) return;
      const key = `${event}:${Number(target)}:${!!payload?.isTyping}`;
      if (time - (typingAt.get(key) ?? -Infinity) < 1000) return;
      // Bound cardinality even if a client cycles through arbitrary recipients.
      if (typingAt.size >= 64 && !typingAt.has(key)) typingAt.delete(typingAt.keys().next().value);
      typingAt.set(key, time);
    }
    next();
  });
}
