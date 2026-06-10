import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies (same pattern as subscribe.test.ts)
const mockPrisma = {
  alertSubscription: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  story: {
    findMany: vi.fn(),
  },
}

const mockBrevo = {
  sendTransactional: vi.fn(),
}

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./brevo.js', () => mockBrevo)

const { unsubscribeFromAlerts, unsubscribeByToken, sendDailyAlerts } = await import('./alerts.js')

describe('alerts unsubscribe (B1 — hard delete, Ley 21.719)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 1 })
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
  })

  describe('unsubscribeByToken (current path)', () => {
    it('DELETES every subscription row for the token owner — no soft-delete', async () => {
      mockPrisma.alertSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        email: 'lectora@example.com',
        token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      })

      const result = await unsubscribeByToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

      expect(result).toBe(true)
      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: 'lectora@example.com' },
      })
      // REGRESSION GUARD: the old behavior flagged rows inactive instead of
      // deleting them — the policy promises removal.
      expect(mockPrisma.alertSubscription.updateMany).not.toHaveBeenCalled()
    })

    it('is idempotent: an unknown or already-used token is a no-op', async () => {
      mockPrisma.alertSubscription.findUnique.mockResolvedValue(null)

      const result = await unsubscribeByToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

      expect(result).toBe(false)
      expect(mockPrisma.alertSubscription.deleteMany).not.toHaveBeenCalled()
    })

    it('ignores token expiry — unsubscribe links must work forever', async () => {
      // expiresAt is in the past: confirmation would reject it, unsubscribe must not.
      mockPrisma.alertSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        email: 'lectora@example.com',
        token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        expiresAt: new Date('2020-01-01'),
      })

      const result = await unsubscribeByToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

      expect(result).toBe(true)
      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalled()
    })
  })

  describe('unsubscribeFromAlerts (legacy email links already in inboxes)', () => {
    it('also hard-deletes instead of flagging inactive', async () => {
      await unsubscribeFromAlerts('lectora@example.com')

      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: 'lectora@example.com' },
      })
      expect(mockPrisma.alertSubscription.updateMany).not.toHaveBeenCalled()
    })
  })
})

describe('alert emails (token links + real publisher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
  })

  it('embeds the token (never the email) in the unsubscribe URL and shows the real publisher', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Noticia sobre litio en territorio mapuche',
        slug: 'noticia-litio',
        summary: 'El litio y la consulta previa…',
        imageUrl: null,
        sourceUrl: 'https://www.elpais.com/chile/2026/litio',
        datePublished: new Date('2026-06-09'),
        issue: { name: 'Chile Intercultural', slug: 'chile' },
        feed: { title: 'Google News', displayTitle: null },
      },
    ])
    mockPrisma.alertSubscription.findMany.mockResolvedValue([
      {
        email: 'lectora@example.com',
        token: 'tok-uuid-1234',
        topics: ['litio'],
        active: true,
        confirmedAt: new Date(),
      },
    ])

    await sendDailyAlerts()

    expect(mockBrevo.sendTransactional).toHaveBeenCalledTimes(1)
    const { body, to } = mockBrevo.sendTransactional.mock.calls[0][0]
    expect(to).toBe('lectora@example.com')
    expect(body).toContain('unsubscribe_token=tok-uuid-1234')
    // The reader's email must not appear in any URL inside the email body.
    expect(body).not.toContain('unsubscribe=lectora')
    // Real outlet derived from sourceUrl, not the discovery feed name.
    expect(body).toContain('El País')
  })
})
