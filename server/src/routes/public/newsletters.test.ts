import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * El archivo público cuenta como enviada una edición despachada a la lista
 * (`sending` o `sent`, con hora), nunca un envío de prueba. Medido el
 * 2-nov-2026: con el filtro anterior (`sent`, que nada escribía) las 52
 * ediciones salían sin fecha.
 */
const mockPrisma = vi.hoisted(() => ({ newsletter: { findMany: vi.fn(), findUnique: vi.fn() } }))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))

const { default: router } = await import('./newsletters.js')
const app = express().use('/api/newsletters', router)

const FILTRO = { isTest: false, status: { in: ['sending', 'sent'] }, sentAt: { not: null } }

beforeEach(() => vi.clearAllMocks())

describe('archivo público del boletín', () => {
  it('la lista toma la fecha de envíos a la lista en sending o sent', async () => {
    mockPrisma.newsletter.findMany.mockResolvedValue([
      { id: 'n1', title: 'Voces Indígenas — Semana N° 44', selectedStoryIds: ['a', 'b'], sends: [{ sentAt: new Date('2026-11-02T09:00:00Z') }] },
    ])

    const res = await request(app).get('/api/newsletters')

    expect(res.status).toBe(200)
    expect(res.body[0].sentAt).toBe('2026-11-02T09:00:00.000Z')
    expect(mockPrisma.newsletter.findMany.mock.calls[0][0].select.sends.where).toEqual(FILTRO)
  })

  it('el detalle usa el mismo filtro', async () => {
    mockPrisma.newsletter.findUnique.mockResolvedValue({
      id: 'n1', title: 'Voces Indígenas — Semana N° 44', html: '<p>x</p>', status: 'published',
      selectedStoryIds: ['a'], sends: [{ sentAt: new Date('2026-11-02T09:00:00Z') }],
    })

    const res = await request(app).get('/api/newsletters/n1')

    expect(res.status).toBe(200)
    expect(res.body.sentAt).toBe('2026-11-02T09:00:00.000Z')
    expect(mockPrisma.newsletter.findUnique.mock.calls[0][0].select.sends.where).toEqual(FILTRO)
  })
})
