import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// Mock the auth service to avoid needing JWT_SECRET in tests
const mockVerifyAccessToken = vi.hoisted(() => vi.fn())
vi.mock('../services/auth.js', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}))

const { requireAuth, requireApiKey, requireRole } = await import('./auth.js')

describe('requireAuth (JWT only)', () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction
  let jsonFn: ReturnType<typeof vi.fn>
  let statusFn: ReturnType<typeof vi.fn>
  const originalKey = process.env.PUBLIC_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    jsonFn = vi.fn()
    statusFn = vi.fn().mockReturnValue({ json: jsonFn })
    req = { headers: {} }
    res = { status: statusFn, json: jsonFn } as any
    next = vi.fn()
  })

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.PUBLIC_API_KEY = originalKey
    } else {
      delete process.env.PUBLIC_API_KEY
    }
  })

  it('returns 401 for missing authorization header', () => {
    req.headers = {}
    requireAuth(req as Request, res as Response, next)
    expect(statusFn).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('authenticates via JWT access token', () => {
    mockVerifyAccessToken.mockReturnValue({
      userId: 'user-1',
      email: 'admin@test.com',
      role: 'admin',
    })
    req.headers = { authorization: 'Bearer valid-jwt-token' }

    requireAuth(req as Request, res as Response, next)

    expect(next).toHaveBeenCalled()
    expect((req as any).user).toEqual({
      userId: 'user-1',
      email: 'admin@test.com',
      role: 'admin',
    })
  })

  it('rejects API key — admin routes are JWT only', () => {
    process.env.PUBLIC_API_KEY = 'test-api-key-123'
    mockVerifyAccessToken.mockImplementation(() => { throw new Error('invalid') })
    req.headers = { authorization: 'Bearer test-api-key-123' }

    requireAuth(req as Request, res as Response, next)

    expect(statusFn).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 for invalid JWT', () => {
    mockVerifyAccessToken.mockImplementation(() => { throw new Error('invalid') })
    req.headers = { authorization: 'Bearer bad-token' }

    requireAuth(req as Request, res as Response, next)

    expect(statusFn).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a long-lived member token on access-token routes', () => {
    mockVerifyAccessToken.mockReturnValue({
      userId: 'user-1',
      email: 'member@test.com',
      role: 'veedor',
      typ: 'member',
    })
    req.headers = { authorization: 'Bearer member-token' }

    requireAuth(req as Request, res as Response, next)

    expect(statusFn).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts an explicit access-type token', () => {
    mockVerifyAccessToken.mockReturnValue({
      userId: 'user-1',
      email: 'admin@test.com',
      role: 'admin',
      typ: 'access',
    })
    req.headers = { authorization: 'Bearer access-token' }

    requireAuth(req as Request, res as Response, next)

    expect(next).toHaveBeenCalled()
  })
})

describe('requireApiKey', () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction
  let jsonFn: ReturnType<typeof vi.fn>
  let statusFn: ReturnType<typeof vi.fn>
  const originalKey = process.env.PUBLIC_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    jsonFn = vi.fn()
    statusFn = vi.fn().mockReturnValue({ json: jsonFn })
    req = { headers: {} }
    res = { status: statusFn, json: jsonFn } as any
    next = vi.fn()
  })

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.PUBLIC_API_KEY = originalKey
    } else {
      delete process.env.PUBLIC_API_KEY
    }
  })

  it('returns 401 for missing authorization header', () => {
    req.headers = {}
    requireApiKey(req as Request, res as Response, next)
    expect(statusFn).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('authenticates with valid API key', () => {
    process.env.PUBLIC_API_KEY = 'test-api-key-123'
    req.headers = { authorization: 'Bearer test-api-key-123' }

    requireApiKey(req as Request, res as Response, next)

    expect(next).toHaveBeenCalled()
    expect((req as any).user).toEqual({
      userId: 'api-key',
      email: 'api-key@system',
      role: 'api-client',
    })
  })

  it('returns 403 for wrong API key', () => {
    process.env.PUBLIC_API_KEY = 'test-api-key-123'
    req.headers = { authorization: 'Bearer wrong-key' }

    requireApiKey(req as Request, res as Response, next)

    expect(statusFn).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a token that is the key plus extra characters (exact match)', () => {
    process.env.PUBLIC_API_KEY = 'test-api-key-123'
    req.headers = { authorization: 'Bearer test-api-key-123-EXTRA' }

    requireApiKey(req as Request, res as Response, next)

    expect(statusFn).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when PUBLIC_API_KEY is not set', () => {
    delete process.env.PUBLIC_API_KEY
    req.headers = { authorization: 'Bearer some-key' }

    requireApiKey(req as Request, res as Response, next)

    expect(statusFn).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requireRole', () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction
  let jsonFn: ReturnType<typeof vi.fn>
  let statusFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    jsonFn = vi.fn()
    statusFn = vi.fn().mockReturnValue({ json: jsonFn })
    req = { headers: {} }
    res = { status: statusFn, json: jsonFn } as any
    next = vi.fn()
  })

  it('allows matching role', () => {
    ;(req as any).user = { userId: 'u1', email: 'a@b.com', role: 'admin' }
    requireRole('admin')(req as Request, res as Response, next)
    expect(next).toHaveBeenCalled()
  })

  it('allows one of multiple roles', () => {
    ;(req as any).user = { userId: 'u1', email: 'a@b.com', role: 'editor' }
    requireRole('admin', 'editor')(req as Request, res as Response, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 403 for non-matching role', () => {
    ;(req as any).user = { userId: 'u1', email: 'a@b.com', role: 'viewer' }
    requireRole('admin')(req as Request, res as Response, next)
    expect(statusFn).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when no user is set', () => {
    requireRole('admin')(req as Request, res as Response, next)
    expect(statusFn).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
