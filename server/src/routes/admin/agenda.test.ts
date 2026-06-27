import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  agendaItem: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))
const mockIngest = vi.hoisted(() => ({ runIngestAgenda: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../jobs/ingestAgenda.js', () => ({ runIngestAgenda: mockIngest.runIngestAgenda }))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

const sampleItem = {
  id: 'a1', type: 'evento', status: 'draft', title: 'Sesión ONU', summary: null,
  dueDate: null, startDate: new Date('2026-07-10'), endDate: null, allDay: false, location: null,
  sourceName: 'ONU', sourceUrl: null, lang: 'es', docRef: null, countries: [], tags: [],
  highlightNew: false, extendedDeadline: false, externalId: 'ical:1', extractionScore: 1,
  publishedAt: null, createdAt: new Date(), updatedAt: new Date(),
}

describe('Admin Agenda API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/agenda')
    expect(res.status).toBe(401)
  })

  it('lists agenda items with total', async () => {
    mockPrisma.agendaItem.findMany.mockResolvedValue([sampleItem])
    mockPrisma.agendaItem.count.mockResolvedValue(1)

    const res = await request(app).get('/api/admin/agenda?status=draft').set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.total).toBe(1)
  })

  it('publishes a draft and stamps publishedAt', async () => {
    mockPrisma.agendaItem.findUnique.mockResolvedValue({ publishedAt: null })
    mockPrisma.agendaItem.update.mockResolvedValue({ ...sampleItem, status: 'published' })

    const res = await request(app).put('/api/admin/agenda/a1').set(authHeader()).send({ status: 'published' })
    expect(res.status).toBe(200)
    expect(mockPrisma.agendaItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ status: 'published', publishedAt: expect.any(Date) }),
      }),
    )
  })

  it('rejects an invalid date with 400', async () => {
    const res = await request(app).put('/api/admin/agenda/a1').set(authHeader()).send({ dueDate: 'not-a-date' })
    expect(res.status).toBe(400)
    expect(mockPrisma.agendaItem.update).not.toHaveBeenCalled()
  })

  it('returns 404 when updating a missing item', async () => {
    mockPrisma.agendaItem.update.mockRejectedValue({ code: 'P2025' })
    const res = await request(app).put('/api/admin/agenda/missing').set(authHeader()).send({ title: 'x' })
    expect(res.status).toBe(404)
  })

  it('deletes an item', async () => {
    mockPrisma.agendaItem.delete.mockResolvedValue(sampleItem)
    const res = await request(app).delete('/api/admin/agenda/a1').set(authHeader())
    expect(res.status).toBe(204)
  })

  it('triggers ingestion', async () => {
    const res = await request(app).post('/api/admin/agenda/ingest').set(authHeader())
    expect(res.status).toBe(200)
    expect(mockIngest.runIngestAgenda).toHaveBeenCalled()
  })
})
