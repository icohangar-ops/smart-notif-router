// Vendored from cubiczan-resilience (typescript/src) — no npm registry available.
// Only the primitives this repo actually wires are re-exported here.
export {
  ResilienceError,
  isResilienceError,
  type ResilienceErrorKind,
  type ResilienceErrorOptions,
} from './errors.js';

export { withTimeout } from './timeout.js';

export { retry, computeBackoff, type RetryOptions } from './retry.js';

export {
  safeFetch,
  type SafeFetchOptions,
  type AllowlistHook,
} from './safeFetch.js';

export {
  SlidingWindowRateLimiter,
  type RateLimitOptions,
  type RateLimitResult,
} from './rateLimit.js';

export {
  requireAuth,
  requireAuthResponse,
  type AuthResult,
  type RequireAuthOptions,
} from './auth.js';
