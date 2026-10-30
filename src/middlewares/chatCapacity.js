import { CapacityGate, positiveLimit } from '../utils/chatCapacity.js';

const gate = new CapacityGate(positiveLimit(process.env.CHAT_MAX_IN_FLIGHT, 64));
const perUser = new Map();
const userLimit = positiveLimit(process.env.CHAT_MAX_IN_FLIGHT_PER_USER, 4);

export function chatCapacity(req, res, next) {
  const userId = req.user.id;
  const active = perUser.get(userId) || 0;
  const release = active < userLimit ? gate.acquire() : null;
  if (!release) {
    res.set('Retry-After', '2');
    return res.status(503).json({ success: false, code: 'CHAT_BUSY', message: 'Chat is busy. Please retry shortly.' });
  }
  perUser.set(userId, active + 1);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    release();
    const remaining = (perUser.get(userId) || 1) - 1;
    if (remaining > 0) perUser.set(userId, remaining);
    else perUser.delete(userId);
    res.off('finish', finish);
    delete req.releaseChatCapacity;
  };
  // A closed client does not cancel SQL work. Keep its slot until response finish
  // or request handler completion is confirmed, rather than releasing on abort.
  req.releaseChatCapacity = finish;
  res.once('finish', () => { if (!req.chatWorkStarted) finish(); });
  res.once('close', () => { if (!req.chatWorkStarted) finish(); });
  next();
}
