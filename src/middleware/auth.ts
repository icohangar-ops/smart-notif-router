import type { Request, Response, NextFunction } from 'express';
import { SlidingWindowRateLimiter } from '../lib/resilience';

/**
 * Static Bearer-token auth middleware.
 *
 * Mirrors the fail-closed contract of cubiczan-resilience's `requireAuth`
 * helper (vendored under src/lib/resilience/auth.ts), adapted to Express:
 *
 *  - If `API_KEY` is unset/empty the middleware FAILS CLOSED with 503
 *    (server misconfigured) — it never degrades to allowing the request.
 *  - A missing/malformed/mismatched `Authorization: Bearer <token>` => 401.
 *
 * The expected token is read once at module load from the API_KEY env var.
 */
const EXPECTED_TOKEN = (process.env.API_KEY || '').trim();

function extractBearer(header: string | undefined): string | undefined {
  const match = (header ?? '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Fail closed: no configured token => refuse, never allow.
  if (!EXPECTED_TOKEN) {
    res.status(503).json({
      success: false,
      error: { code: 'AUTH_MISCONFIGURED', message: 'Server misconfigured: API_KEY is not set' },
    });
    return;
  }

  const provided = extractBearer(req.headers.authorization);
  if (!provided || provided !== EXPECTED_TOKEN) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    });
    return;
  }

  next();
}

/**
 * Lightweight Express rate-limit middleware backed by the vendored
 * SlidingWindowRateLimiter. Avoids pulling express-rate-limit as a new dep
 * while still satisfying the audit's "rate-limit the POST route" requirement.
 *
 * Keyed by client IP. Single-process only (back with a shared store for
 * multi-instance deployments).
 */
export function rateLimit(options: { limit: number; windowMs: number }) {
  const limiter = new SlidingWindowRateLimiter(options);
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const result = limiter.check(key);
    if (!result.allowed) {
      const retryAfterMs = Math.max(0, result.resetAt - Date.now());
      res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too Many Requests' },
      });
      return;
    }
    next();
  };
}
