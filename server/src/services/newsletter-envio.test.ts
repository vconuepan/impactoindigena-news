import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * El envío del boletín pasa a `sent` cuando Brevo lo confirma.
 *
 * Hasta el 2-nov-2026 ninguna línea escribía ese estado: `sendLive` deja la fila
 * en `sending` y el refresco solo guardaba métricas. Las 52 ediciones del archivo
 * público salían sin fecha.
 */
const mockPrisma = vi.hoisted(() => ({
  newsletterSend: { findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn() },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockDelivery = vi.hoisted(() => vi.fn())
vi.mock('./brevo.js', () => ({ getCampaignDelivery: mockDelivery }))

const { refreshSendStats, refrescarEnviosRecientes } = await import('./newsletter.js')

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

describe('refrescarEnviosRecientes · los jobs de envío ponen al día a las ediciones anteriores', () => {
  // Hasta el 7-nov-2026 solo el botón «Refresh stats» del panel lo hacía.
  it('pide solo los envíos reales, con campaña, de las últimas semanas', async () => {
    mockPrisma.newsletterSend.findMany.mockResolvedValue([])
    await refrescarEnviosRecientes({ diasAtras: 45 })
    const { where } = mockPrisma.newsletterSend.findMany.mock.calls[0][0]
    expect(where.isTest).toBe(false)
    expect(where.plunkCampaignId).toEqual({ not: null })
    const dias = (Date.now() - where.createdAt.gte.getTime()) / 86_400_000
    expect(Math.round(dias)).toBe(45)
  })

  it('refresca cada uno y un fallo de Brevo no corta a los demás', async () => {
    mockPrisma.newsletterSend.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    mockPrisma.newsletterSend.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => fila({ id: where.id }))
    mockDelivery
      .mockResolvedValueOnce({ stats: STATS, status: 'sent', sentDate: null })
      .mockRejectedValueOnce(new Error('404 de Brevo'))
      .mockResolvedValueOnce({ stats: STATS, status: 'sent', sentDate: null })

    const r = await refrescarEnviosRecientes()

    expect(r).toEqual({ revisados: 3, fallidos: 1 })
    expect(mockPrisma.newsletterSend.update).toHaveBeenCalledTimes(2)
  })
})
