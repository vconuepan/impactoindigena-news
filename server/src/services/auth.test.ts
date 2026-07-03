import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

const mockPrisma = vi.hoisted(() => ({
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const originalEnv = process.env.JWT_SECRET

beforeEach(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-padded'
  vi.clearAllMocks()
})

afterEach(() => {
  if (originalEnv !== undefined) {
    process.env.JWT_SECRET = originalEnv
  } else {
    delete process.env.JWT_SECRET
  }
})

const {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
} = await import('./auth.js')

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('mypassword123')
    expect(hash).not.toBe('mypassword123')
    expect(hash).toMatch(/^\$2[aby]?\$/)
    expect(await verifyPassword('mypassword123', hash)).toBe(true)
  })

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct-password')
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })
})

describe('generateAccessToken / verifyAccessToken', () => {
  it('generates and verifies a JWT', () => {
    const token = generateAccessToken({ id: 'user-1', email: 'a@b.com', role: 'admin' })
    expect(typeof token).toBe('string')

    const payload = verifyAccessToken(token)
    expect(payload.userId).toBe('user-1')
    expect(payload.email).toBe('a@b.com')
    expect(payload.role).toBe('admin')
  })

  it('throws for invalid token', () => {
    expect(() => verifyAccessToken('not.a.valid.token')).toThrow()
  })

  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET
    expect(() =>
      generateAccessToken({ id: 'user-1', email: 'a@b.com', role: 'admin' })
    ).toThrow('JWT_SECRET')
  })
})

describe('generateRefreshToken', () => {
  it('creates a refresh token in the database', async () => {
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'abc' })

    const token = await generateRefreshToken('user-1')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(20)
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        token: expect.any(String),
        expiresAt: expect.any(Date),
        familyId: expect.any(String),
      }),
    })
    // The token is stored hashed, never in raw form
    const stored = mockPrisma.refreshToken.create.mock.calls[0][0].data.token
    expect(stored).not.toBe(token)
    expect(stored).toBe(sha256(token))
  })

  it('creates token with new familyId when none provided', async () => {
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'abc' })

    await generateRefreshToken('user-1')
    const call1 = mockPrisma.refreshToken.create.mock.calls[0][0].data.familyId

    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2', token: 'def' })
    await generateRefreshToken('user-1')
    const call2 = mockPrisma.refreshToken.create.mock.calls[1][0].data.familyId

    // Each call should generate a unique familyId
    expect(typeof call1).toBe('string')
    expect(typeof call2).toBe('string')
    expect(call1).not.toBe(call2)
  })

  it('creates token with provided familyId', async () => {
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'abc' })

    await generateRefreshToken('user-1', 'family-123')
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        familyId: 'family-123',
      }),
    })
  })
})

describe('rotateRefreshToken', () => {
  it('soft-rotates old token and creates new with same familyId', async () => {
    const user = { id: 'user-1', email: 'a@b.com', role: 'admin' }
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: 'old-token',
      userId: 'user-1',
      familyId: 'family-abc',
      rotatedAt: null,
      user,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    })
    mockPrisma.refreshToken.update.mockResolvedValue({})
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2', token: 'new-token' })

    const result = await rotateRefreshToken('old-token')
    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()

    // Should soft-rotate (update with rotatedAt) instead of hard delete
    expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { rotatedAt: expect.any(Date) },
    })
    expect(mockPrisma.refreshToken.delete).not.toHaveBeenCalled()

    // New token should use same familyId
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: 'family-abc',
      }),
    })
  })

  it('throws for invalid token', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null)
    await expect(rotateRefreshToken('bad-token')).rejects.toThrow('Invalid refresh token')
  })

  it('throws for expired token and deletes it', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: 'expired-token',
      userId: 'user-1',
      familyId: 'family-abc',
      rotatedAt: null,
      user: { id: 'user-1', email: 'a@b.com', role: 'admin' },
      expiresAt: new Date(Date.now() - 1000),
    })
    mockPrisma.refreshToken.delete.mockResolvedValue({})

    await expect(rotateRefreshToken('expired-token')).rejects.toThrow('Refresh token expired')
    expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } })
  })

  it('detects reuse when token has rotatedAt set and revokes entire family', async () => {
    const user = { id: 'user-1', email: 'a@b.com', role: 'admin' }
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: 'reused-token',
      userId: 'user-1',
      familyId: 'family-abc',
      rotatedAt: new Date(Date.now() - 5000), // already rotated
      user,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    })
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })

    await expect(rotateRefreshToken('reused-token')).rejects.toThrow(
      'Refresh token reuse detected'
    )
  })

  it('reuse detection revokes all tokens in the family via deleteMany', async () => {
    const user = { id: 'user-1', email: 'a@b.com', role: 'admin' }
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: 'reused-token',
      userId: 'user-1',
      familyId: 'family-abc',
      rotatedAt: new Date(Date.now() - 5000),
      user,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    })
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })

    try {
      await rotateRefreshToken('reused-token')
    } catch {
      // expected
    }

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { familyId: 'family-abc' },
    })
  })
})

describe('revokeRefreshToken', () => {
  it('deletes the token', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })
    await revokeRefreshToken('some-token')
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { token: sha256('some-token') } })
  })
})

describe('revokeAllUserTokens', () => {
  it('deletes all tokens for user', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })
    await revokeAllUserTokens('user-1')
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
  })
})

describe('cleanupExpiredTokens', () => {
  it('deletes tokens with expiresAt in the past', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 })
    const count = await cleanupExpiredTokens()
    expect(count).toBe(5)
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    })
  })

  it('returns 0 when no expired tokens exist', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 })
    const count = await cleanupExpiredTokens()
    expect(count).toBe(0)
  })
})
