import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockPrisma = {
  pendingSubscription: {
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}

const mockBrevo = {
  createContact: vi.fn(),
  sendTransactional: vi.fn(),
  verifyEmail: vi.fn(),
}

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./brevo.js', () => mockBrevo)

const { subscribe, EmailValidationError, cleanupExpiredPendingSubscriptions } = await import('./subscribe.js')

describe('subscribe service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.pendingSubscription.findFirst.mockResolvedValue(null)
    mockPrisma.pendingSubscription.create.mockResolvedValue({ id: '1' })
    mockPrisma.pendingSubscription.deleteMany.mockResolvedValue({ count: 0 })
    mockBrevo.createContact.mockResolvedValue({ id: 'contact-1' })
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
    mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: true, isDisposable: false })
  })

  describe('email verification', () => {
    it('calls verifyEmail before creating contact', async () => {
      const callOrder: string[] = []
      mockBrevo.verifyEmail.mockImplementation(async () => {
        callOrder.push('verify')
        return { valid: true, domainExists: true, isDisposable: false }
      })
      mockBrevo.createContact.mockImplementation(async () => {
        callOrder.push('createContact')
        return { id: 'contact-1' }
      })

      await subscribe({ email: 'test@example.com' })

      expect(callOrder).toEqual(['verify', 'createContact'])
    })

    it('throws EmailValidationError when email is invalid', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: false, domainExists: true, isDisposable: false })

      await expect(subscribe({ email: 'bad@example.com' })).rejects.toThrow(EmailValidationError)
    })

    it('throws EmailValidationError when domain does not exist', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: false, isDisposable: false })

      await expect(subscribe({ email: 'user@nodomain.fake' })).rejects.toThrow(EmailValidationError)
    })

    it('throws EmailValidationError for disposable emails', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: true, isDisposable: true })

      await expect(subscribe({ email: 'temp@mailinator.com' })).rejects.toThrow(EmailValidationError)
    })

    it('includes user-facing message in EmailValidationError', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: false, domainExists: true, isDisposable: false })

      try {
        await subscribe({ email: 'bad@example.com' })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(EmailValidationError)
        expect((err as InstanceType<typeof EmailValidationError>).message).toBeTruthy()
      }
    })

    it('skips verification gracefully if Brevo verify API fails', async () => {
      mockBrevo.verifyEmail.mockRejectedValue(new Error('Brevo API down'))

      // Should not throw — graceful degradation
      await subscribe({ email: 'test@example.com' })

      expect(mockBrevo.createContact).toHaveBeenCalled()
    })
  })

  describe('firstName parameter', () => {
    it('passes firstName to createContact data', async () => {
      await subscribe({ email: 'test@example.com', firstName: 'John' })

      expect(mockBrevo.createContact).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ NOMBRE: 'John' }),
        }),
      )
    })

    it('works without firstName', async () => {
      await subscribe({ email: 'test@example.com' })

      expect(mockBrevo.createContact).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          subscribed: false,
        }),
      )
    })

    it('personalizes confirmation email when firstName provided', async () => {
      await subscribe({ email: 'test@example.com', firstName: 'Jane' })

      const emailBody = mockBrevo.sendTransactional.mock.calls[0][0].body
      expect(emailBody).toContain('Jane')
    })

    it('does not include a name in greeting when firstName not provided', async () => {
      await subscribe({ email: 'test@example.com' })

      const emailBody = mockBrevo.sendTransactional.mock.calls[0][0].body
      expect(emailBody).not.toContain('Jane')
    })
  })

  describe('existing subscription', () => {
    it('returns early if already confirmed', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue({ confirmedAt: new Date() })

      await subscribe({ email: 'existing@example.com' })

      expect(mockBrevo.verifyEmail).not.toHaveBeenCalled()
      expect(mockBrevo.createContact).not.toHaveBeenCalled()
    })
  })

  describe('re-subscribe (unconfirmed)', () => {
    it('deletes existing unconfirmed entries before creating new one', async () => {
      mockPrisma.pendingSubscription.deleteMany.mockResolvedValue({ count: 1 })

      await subscribe({ email: 'retry@example.com' })

      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: 'retry@example.com', confirmedAt: null },
      })
      expect(mockPrisma.pendingSubscription.create).toHaveBeenCalled()
    })

    it('deletes unconfirmed entries after email verification', async () => {
      const callOrder: string[] = []
      mockBrevo.verifyEmail.mockImplementation(async () => {
        callOrder.push('verify')
        return { valid: true, domainExists: true, isDisposable: false }
      })
      mockPrisma.pendingSubscription.deleteMany.mockImplementation(async () => {
        callOrder.push('deleteMany')
        return { count: 0 }
      })

      await subscribe({ email: 'test@example.com' })

      expect(callOrder).toEqual(['verify', 'deleteMany'])
    })

    it('does not delete confirmed entries', async () => {
      await subscribe({ email: 'test@example.com' })

      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ confirmedAt: null }),
      })
    })

    it('skips re-subscribe cleanup when already confirmed', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue({ confirmedAt: new Date() })

      await subscribe({ email: 'confirmed@example.com' })

      expect(mockPrisma.pendingSubscription.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe('cleanupExpiredPendingSubscriptions (retention — Ley 21.719)', () => {
    it('deletes only unconfirmed pending subscriptions whose token expired', async () => {
      mockPrisma.pendingSubscription.deleteMany.mockResolvedValue({ count: 3 })

      const count = await cleanupExpiredPendingSubscriptions()

      expect(count).toBe(3)
      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({
        where: { confirmedAt: null, expiresAt: { lt: expect.any(Date) } },
      })
    })
  })
})
