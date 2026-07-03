import rateLimit from 'express-rate-limit'
import { config } from '../config.js'

/**
 * General API rate limiter.
 * Applied to public endpoints to prevent abuse.
 */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.publicWindowMs,
  max: config.rateLimit.publicMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please try again later.'
  }
})

/**
 * Operational rate limiter for LLM-triggering endpoints.
 * Not a security measure — admins are trusted. This prevents runaway
 * costs by capping the number of LLM operations per hour.
 * Each endpoint tracks its own budget via keyGenerator.
 */
export const expensiveOpLimiter = rateLimit({
  windowMs: config.rateLimit.expensiveWindowMs,
  max: config.rateLimit.expensiveMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}-${req.baseUrl}${req.path}`,
  message: {
    error: 'Operational limit reached for this endpoint. Please try again later.'
  }
})

/**
 * Stricter rate limiter for search queries that trigger OpenAI embedding calls.
 * 20 searches per 15 minutes per IP (vs 100 for general API).
 */
export const searchLimiter = rateLimit({
  windowMs: config.rateLimit.searchWindowMs,
  max: config.rateLimit.searchMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many search requests. Please try again later.'
  }
})

/**
 * Rate limiter for the bot-facing OG/social-unfurl proxy (/og).
 * Generous enough not to throttle legitimate crawlers unfurling shared links,
 * but bounds a single IP from hammering the DB-backed endpoints. The shell is
 * cached separately, so each request is otherwise cheap.
 */
export const ogLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please try again later.'
  }
})

/**
 * Strict rate limiter for login endpoint.
 * 5 attempts per 15 minutes per IP to prevent brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please try again later.'
  }
})

/**
 * Per-account login limiter. Complements authLimiter (per-IP) by capping failed
 * attempts against a single email regardless of source IP, blunting distributed
 * / rotating-IP brute force. Only failures count (skipSuccessfulRequests), so a
 * legitimate user who mistypes then succeeds is never locked out.
 */
export const accountAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : ''
    return email ? `acct:${email}` : `acct-ip:${req.ip}`
  },
  message: {
    error: 'Too many login attempts for this account. Please try again later.'
  }
})

/**
 * Rate limiter for magic link requests.
 * 5 requests per 15 minutes per IP to prevent email spam.
 */
export const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many magic link requests. Please try again later.'
  }
})

/**
 * Rate limiter for token refresh endpoint.
 * More lenient than login since refresh is called automatically by the client.
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many refresh attempts. Please try again later.'
  }
})
