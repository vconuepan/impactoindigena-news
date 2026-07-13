import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
  },
  refreshToken: {
    deleteMany: vi.fn(),
  },
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

// Mock bcryptjs so we can control password verification
const mockBcrypt = vi.hoisted(() => ({
  hash: vi.fn(),
  compare: vi.fn(),
  // auth.ts computes DUMMY_PASSWORD_HASH = bcrypt.hashSync(...) at import time
  // (timing-attack defense added in the security PR); the mock must provide it.
  hashSync: vi.fn(() => '$2a$12$dummyhashfortimingequalization'),
}))
vi.mock('bcryptjs', () => ({ default: mockBcrypt }))

const { changePassword, resetPassword } = await import('./user.js')

describe('changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('changes password when current password is correct', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'old-hash',
    })
    mockBcrypt.compare.mockResolvedValue(true)
    mockBcrypt.hash.mockResolvedValue('new-hash')
    mockPrisma.user.update.mockResolvedValue({})
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 })

    await changePassword('user-1', 'oldpass', 'newpass123')

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } })
    expect(mockBcrypt.compare).toHaveBeenCalledWith('oldpass', 'old-hash')
    expect(mockBcrypt.hash).toHaveBeenCalledWith('newpass123', 12)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'new-hash' },
    })
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })

  it('throws when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    await expect(changePassword('nonexistent', 'old', 'new12345')).rejects.toThrow(
      'User not found',
    )
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('throws when current password is wrong', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'old-hash',
    })
    mockBcrypt.compare.mockResolvedValue(false)

    await expect(changePassword('user-1', 'wrongpass', 'newpass12')).rejects.toThrow(
      'Current password is incorrect',
    )
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
    expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled()
  })

  it('revokes all refresh tokens after password change', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'old-hash',
    })
    mockBcrypt.compare.mockResolvedValue(true)
    mockBcrypt.hash.mockResolvedValue('new-hash')
    mockPrisma.user.update.mockResolvedValue({})
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })

    await changePassword('user-1', 'oldpass', 'newpass123')

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })
})

describe('resetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resets password without requiring current password', async () => {
    mockBcrypt.hash.mockResolvedValue('reset-hash')
    mockPrisma.user.update.mockResolvedValue({})
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

    await resetPassword('user-1', 'newpass123')

    expect(mockBcrypt.hash).toHaveBeenCalledWith('newpass123', 12)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'reset-hash' },
    })
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })

  it('does not verify current password', async () => {
    mockBcrypt.hash.mockResolvedValue('reset-hash')
    mockPrisma.user.update.mockResolvedValue({})
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 })

    await resetPassword('user-1', 'newpass123')

    expect(mockBcrypt.compare).not.toHaveBeenCalled()
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('revokes all refresh tokens after reset', async () => {
    mockBcrypt.hash.mockResolvedValue('reset-hash')
    mockPrisma.user.update.mockResolvedValue({})
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 })

    await resetPassword('user-1', 'newpass123')

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })
})
