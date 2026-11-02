import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * El envío del boletín pasa a `sent` cuando Brevo lo confirma.
 *
 * Hasta el 2-nov-2026 ninguna línea escribía ese estado: `sendLive` deja la fila
 * en `sending` y el refresco solo guardaba métricas. Las 52 ediciones del archivo
 * público salían sin fecha.
 */
const mockPrisma = vi.hoisted(() => ({
  newsletterSend: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockDelivery = vi.hoisted(() => vi.fn())
vi.mock('./brevo.js', () => ({ getCampaignDelivery: mockDelivery }))

const { refreshSendStats } = await import('./newsletter.js')

const ENVIADA_EL = new Date('2026-10-26T09:00:00.000Z')
const fila = (over: Record<string, unknown> = {}) => ({
  id: 's1', plunkCampaignId: '42', status: 'sending', sentAt: ENVIADA_EL, ...over,
})
const STATS = { delivered: 8, opened: 3, clicked: 1, bounced: 0, complained: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.newsletterSend.update.mockImplementation(async (a: unknown) => a)
})

describe('refreshSendStats · la transición a sent', () => {
  it('cuando Brevo dice sent, pasa a sent con la hora de Brevo', async () => {
    mockPrisma.newsletterSend.findUniqueOrThrow.mockResolvedValue(fila())
    mockDelivery.mockResolvedValue({ stats: STATS, status: 'sent', sentDate: '2026-10-26T09:00:12.000Z' })

    await refreshSendStats('s1')

    const { data } = mockPrisma.newsletterSend.update.mock.calls[0][0]
    expect(data.status).toBe('sent')
    expect(data.sentAt).toEqual(new Date('2026-10-26T09:00:12.000Z'))
    expect(data.stats).toEqual(STATS)
  })

  it('si Brevo no da la hora, conserva la que había', async () => {
    mockPrisma.newsletterSend.findUniqueOrThrow.mockResolvedValue(fila())
    mockDelivery.mockResolvedValue({ stats: STATS, status: 'sent', sentDate: null })

    await refreshSendStats('s1')

    expect(mockPrisma.newsletterSend.update.mock.calls[0][0].data.sentAt).toEqual(ENVIADA_EL)
  })

  it('en proceso, solo guarda métricas y no toca el estado', async () => {
    mockPrisma.newsletterSend.findUniqueOrThrow.mockResolvedValue(fila())
    mockDelivery.mockResolvedValue({ stats: STATS, status: 'in_process', sentDate: null })

    await refreshSendStats('s1')

    const { data } = mockPrisma.newsletterSend.update.mock.calls[0][0]
    expect(data.status).toBeUndefined()
    expect(data.sentAt).toBeUndefined()
  })

  it('ya en sent, no reescribe la hora', async () => {
    mockPrisma.newsletterSend.findUniqueOrThrow.mockResolvedValue(fila({ status: 'sent' }))
    mockDelivery.mockResolvedValue({ stats: STATS, status: 'sent', sentDate: '2026-10-27T00:00:00.000Z' })

    await refreshSendStats('s1')

    expect(mockPrisma.newsletterSend.update.mock.calls[0][0].data.sentAt).toBeUndefined()
  })
})
