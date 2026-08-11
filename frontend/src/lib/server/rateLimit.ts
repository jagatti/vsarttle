const bucketByKey = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const current = (bucketByKey.get(key) ?? []).filter((entry) => entry > cutoff);
  if (current.length >= limit) {
    bucketByKey.set(key, current);
    return false;
  }
  current.push(now);
  bucketByKey.set(key, current);
  return true;
}
