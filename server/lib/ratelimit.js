'use strict';

const buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 30, keyFn } = {}) {
  return function limiter(req, res, next) {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset < now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retry = Math.ceil((bucket.reset - now) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({
        error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
        retryAfter: retry
      });
    }
    return next();
  };
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.reset < now) buckets.delete(key);
  }
}, 60_000);
if (cleanup.unref) cleanup.unref();

module.exports = { rateLimit };
