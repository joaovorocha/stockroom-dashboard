const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

// In-memory activity tracker (resets on server restart).
// Keyed by userId/employeeId to avoid leaking cookie contents.
const activeUsers = new Map();

function getUserKey(user) {
  const userId = (user?.userId ?? '').toString().trim();
  const employeeId = (user?.employeeId ?? '').toString().trim();
  return userId || employeeId || '';
}

function markActive(user, req) {
  const key = getUserKey(user);
  if (!key) return;

  const now = Date.now();
  activeUsers.set(key, {
    key,
    userId: (user?.userId ?? null),
    employeeId: (user?.employeeId ?? null),
    name: (user?.name ?? null),
    role: (user?.role ?? null),
    lastSeenAt: now,
    lastPath: (req?.originalUrl || req?.url || null),
  });
}

function getActiveUsersSummary({ windowMs = DEFAULT_WINDOW_MS } = {}) {
  const now = Date.now();
  const cutoff = now - windowMs;

  // prune
  for (const [key, info] of activeUsers.entries()) {
    if (!info || !info.lastSeenAt || info.lastSeenAt < cutoff) activeUsers.delete(key);
  }

  const users = Array.from(activeUsers.values())
    .filter(u => u && u.lastSeenAt >= cutoff)
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));

  return {
    windowMs,
    activeCount: users.length,
    users,
  };
}

module.exports = {
  markActive,
  getActiveUsersSummary,
};
