import type { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'crypto'
import { verifyAccessToken, type AccessTokenPayload } from '../services/auth.js'

export interface AuthUser {
  userId: string
  email: string
  role: string
}

declare global {
  namespace Express {
    interface Request {
      id?: string
      user?: AuthUser
      parsedQuery?: Record<string, any>
    }
  }
}

/**
 * Try to authenticate via JWT access token.
 * Returns the payload if valid, null otherwise.
 */
function tryJwtAuth(token: string): AccessTokenPayload | null {
  try {
    return verifyAccessToken(token)
  } catch {
    return null
  }
}

/**
 * Try to authenticate via static API key.
 * Returns true if the token matches the PUBLIC_API_KEY env var.
 */
function tryApiKeyAuth(token: string): boolean {
  const apiKey = process.env.PUBLIC_API_KEY
  if (!apiKey) return false

  const keyBuf = Buffer.from(apiKey)
  // Pad/truncate to same length to avoid timing leak on length comparison
  const tokenBuf = Buffer.alloc(keyBuf.length)
  tokenBuf.write(token, 'utf8')
  return timingSafeEqual(tokenBuf, keyBuf)
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}

/**
 * Admin authentication middleware (JWT only).
 * Used for admin routes — API key is not accepted.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req)

  if (!token) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }

  const jwtPayload = tryJwtAuth(token)
  if (jwtPayload) {
    req.user = {
      userId: jwtPayload.userId,
      email: jwtPayload.email,
      role: jwtPayload.role,
    }
    next()
    return
  }

  res.status(401).json({ error: 'Invalid credentials' })
}

/**
 * API key authentication middleware.
 * Used for public API routes that need authenticated access (mobile apps, etc.).
 * Accepts the static PUBLIC_API_KEY as a Bearer token.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req)

  if (!token) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }

  if (tryApiKeyAuth(token)) {
    req.user = {
      userId: 'api-key',
      email: 'api-key@system',
      role: 'api-client',
    }
    next()
    return
  }

  res.status(403).json({ error: 'Invalid API key' })
}

/**
 * Member authentication middleware.
 * Accepts either an httpOnly cookie `member_token` (preferred, set by magic link verify)
 * or a legacy Authorization: Bearer header. Cookie takes precedence.
 * Used for community join/leave/membership endpoints accessible to VEEDOR users.
 */
export function requireMember(req: Request, res: Response, next: NextFunction): void {
  // Cookie-based auth (preferred — token never exposed in URL or localStorage)
  const cookieToken: string | undefined = (req.cookies as Record<string, string>)?.member_token
  // Fallback: Authorization header (legacy / non-browser clients)
  const bearerToken = extractBearerToken(req)
  const token = cookieToken ?? bearerToken

  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const payload = tryJwtAuth(token)
  if (payload) {
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    }
    next()
    return
  }

  res.status(401).json({ error: 'Invalid or expired token' })
}

/**
 * Role check middleware. Use after requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }
}
