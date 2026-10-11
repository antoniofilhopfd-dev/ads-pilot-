// Limitador em memória (1 processo). Suficiente para uma única instância Node;
// com várias instâncias seria necessário mover para o banco ou Redis.
const hits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  h.count += 1;
  return h.count <= max;
}

export const resetRateLimits = () => hits.clear();
