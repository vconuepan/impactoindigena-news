import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes, randomUUID, createHash } from 'crypto'
import prisma from '../lib/prisma.js'

/**
 * Hash a bearer/refresh/magic-link token for storage at rest, so a database
 * leak does not expose replayable tokens. The raw token lives only in the
 * client cookie or the emailed link.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const BCRYPT_ROUNDS = 12
const ACCESS_TOKEN_EXPIRY = '15m'
const MEMBER_TOKEN_EXPIRY = '30d'
const REFRESH_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface AccessTokenPayload {
  userId: string
  email: string
  role: string
  /**
   * Token type. 'access' = short-lived password/admin session; 'member' =
   * long-lived passwordless magic-link session. Distinguishing them stops a
   * 30-day member token from being replayed on an access-token-only route.
   * Optional for backward compatibility with tokens issued before this claim.
   */
  typ?: 'access' | 'member'
}

const MIN_JWT_SECRET_LENGTH = 32

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`)
  }
  return secret
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * A valid bcrypt hash of a random string, used to equalize login timing when
 * the email is unknown. Running a real bcrypt comparison against it prevents an
 * attacker from distinguishing "user does not exist" from "wrong password" by
 * response latency (user enumeration).
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalization-placeholder', BCRYPT_ROUNDS)

export function generateAccessToken(user: { id: string; email: string; userType?: string; role?: string }): string {
  const payload: AccessTokenPayload = {
    userId: user.id,
    email: user.email,
    role: (user.userType ?? user.role ?? 'viewer').toLowerCase(),
    typ: 'access',
  }
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY })
}

/** Long-lived token (30 days) for public members authenticated via magic link. */
export function generateMemberToken(user: { id: string; email: string }): string {
  const payload: AccessTokenPayload = {
    userId: user.id,
    email: user.email,
    role: 'veedor',
    typ: 'member',
  }
  return jwt.sign(payload, getJwtSecret(), { expiresIn: MEMBER_TOKEN_EXPIRY })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as AccessTokenPayload
}

export async function generateRefreshToken(userId: string, familyId?: string): Promise<string> {
  const token = randomBytes(40).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS)
  const family = familyId ?? randomUUID()

  await prisma.refreshToken.create({
    data: { token: hashToken(token), userId, expiresAt, familyId: family },
  })

  return token
}

export async function rotateRefreshToken(
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const record = await prisma.refreshToken.findUnique({
    where: { token: hashToken(oldToken) },
    include: { user: true },
  })

  if (!record) throw new Error('Invalid refresh token')
  if (record.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: record.id } })
    throw new Error('Refresh token expired')
  }

  // Reuse detection: if this token was already rotated, revoke the entire family
  if (record.rotatedAt) {
    await prisma.refreshToken.deleteMany({ where: { familyId: record.familyId } })
    throw new Error('Refresh token reuse detected')
  }

  // Soft-rotate: mark old token as rotated instead of deleting
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { rotatedAt: new Date() },
  })

  // Generate new pair with same familyId
  const accessToken = generateAccessToken(record.user)
  const refreshToken = await generateRefreshToken(record.user.id, record.familyId)

  return { accessToken, refreshToken }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token: hashToken(token) } })
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } })
}

export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return result.count
}

/** Remove magic links that expired more than 24 hours ago (already used or timed out). */
export async function cleanupExpiredMagicLinks(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const result = await prisma.magicLink.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  })
  return result.count
}
