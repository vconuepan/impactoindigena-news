import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

/**
 * El correo de bienvenida arma HTML con el nombre de quien se une (lo escribe
 * esa persona), el nombre de la comunidad y las tres notas mas recientes, cuyo
 * titulo de fuente sale de la pagina de un tercero. Ninguno puede llegar como
 * marcado desde el remitente de la Fundacion.
 */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  community: { findUnique: vi.fn() },
  communityMember: { findUnique: vi.fn(), upsert: vi.fn() },
  story: { findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
const sendTransactional = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/brevo.js', () => ({ sendTransactional, verifyEmail: vi.fn() }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const TEST_JWT_SECRET = 'test-jwt-secret-for-helpers-padded-32'
process.env.JWT_SECRET = TEST_JWT_SECRET
const memberAuth = () => ({ Authorization: `Bearer ${jwt.sign({ userId: 'veedor-1', email: 'm@example.com', role: 'veedor' }, TEST_JWT_SECRET, { expiresIn: '1h' })}` })

const { default: app } = await import('../../app.js')

const ATAQUE = '<a href="https://evil.example/entra">Verifica tu cuenta</a><img src="https://evil.example/p.gif">'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.community.findUnique.mockResolvedValue({ id: 'c-mapuche', slug: 'mapuche', name: `Pueblo ${ATAQUE}`, type: 'TERRITORIO', issueIds: [], keywords: ['mapuche'] })
  mockPrisma.communityMember.findUnique.mockResolvedValue(null)
  mockPrisma.communityMember.upsert.mockResolvedValue({ userId: 'veedor-1', communityId: 'c-mapuche' })
  mockPrisma.user.findUnique.mockResolvedValue({ email: 'm@example.com', name: `Ana<script>alert(1)</script>` })
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.$queryRaw.mockResolvedValue([])
  mockPrisma.story.findMany.mockResolvedValue([
    { title: `Mapuche ${ATAQUE}`, slug: 'nota-1', summary: `Resumen ${ATAQUE}`, sourceTitle: `Fuente ${ATAQUE}` },
  ])
})

async function esperarCorreo() {
  for (let i = 0; i < 50 && sendTransactional.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 5))
}

describe('correo de bienvenida: lo que viene de afuera no entra como marcado', () => {
  it('codifica el saludo, el nombre de la comunidad y la fuente, el titulo y el resumen de las notas', async () => {
    const res = await request(app).post('/api/communities/mapuche/join').set(memberAuth())
    expect(res.status).toBe(200)
    await esperarCorreo()

    expect(sendTransactional).toHaveBeenCalledOnce()
    const { body } = sendTransactional.mock.calls[0][0]
    expect(body).not.toContain('<a href="https://evil.example')
    expect(body).not.toContain('<img src="https://evil.example')
    expect(body).not.toContain('<script>')
    expect(body).toContain('&lt;a href=&quot;https://evil.example/entra&quot;&gt;')
  })
})
