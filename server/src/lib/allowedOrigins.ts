import type { Request } from 'express'

/**
 * Origins trusted for authenticated / state-changing requests. Shared by the
 * CORS layer (app.ts) and the CSRF Origin check (middleware/auth.ts) so the two
 * never drift apart.
 */
export function getAllowedOrigins(): string[] {
  return [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'http://localhost:5174',
    'http://localhost:4174',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:4174',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[]
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function originFromReferer(referer: string | undefined): string | null {
  if (!referer) return null
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

/**
 * CSRF defense (OWASP-recommended for APIs): verify the request's Origin (or
 * Referer fallback) is allowlisted. Safe (non-mutating) methods always pass.
 * A cross-site attacker's browser always attaches its own Origin on a POST, so
 * a forged request carries a non-allowlisted Origin and is rejected; the real
 * frontend sends its own allowlisted Origin. An absent Origin/Referer on an
 * unsafe method is treated as untrusted.
 */
export function isTrustedOrigin(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true
  const source = req.headers.origin || originFromReferer(req.headers.referer)
  return !!source && getAllowedOrigins().includes(source)
}
