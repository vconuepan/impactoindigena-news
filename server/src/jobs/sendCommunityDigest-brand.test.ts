import { describe, it, expect, vi, beforeEach } from 'vitest'

/** El digest semanal con la vitrina de marca (D5, entrega 2). */
const mockPrisma = vi.hoisted(() => ({
  communityMember: { findMany: vi.fn() },
  digestExclusion: { findMany: vi.fn() },
  story: { findMany: vi.fn() },
  storyBrandAssessment: { findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}))
const sendTransactional = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/brevo.js', () => ({ sendTransactional }))

const { runSendCommunityDigest } = await import('./sendCommunityDigest.js')
const ATAQUE = '<img src="https://evil.example/p.gif">'
const marca = vi.hoisted(() => ({ mode: 'enforce' }))

beforeEach(() => {
  vi.clearAllMocks()
  marca.mode = 'enforce'
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.digestExclusion.findMany.mockResolvedValue([])
  mockPrisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join('?').includes('community_brand_criteria') ? [{ mode: marca.mode, rescue_mode: 'off' }] : [],
  )
  mockPrisma.communityMember.findMany.mockResolvedValue([
    { user: { id: 'u1', email: 'u1@example.com', name: 'Ana' }, community: { id: 'c1', slug: 'wallmapu-araucania', name: 'Araucanía', type: 'TERRITORIO', issueIds: [], keywords: ['temuco'] } },
  ])
  mockPrisma.story.findMany.mockResolvedValue([{ title: 'Publicada', slug: 'nota-1', summary: 'R', sourceTitle: 'Fuente', datePublished: new Date('2026-10-10') }])
  mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([
    {
      brandTitle: `De marca ${ATAQUE}`, brandSummary: 'Resumen de marca.', brandSlug: 'de-marca-abc', brandDate: new Date('2026-10-12'),
      brandScore: 6, axis: 'region_completa', place: null, sourceSignal: 'term',
      story: { id: 's2', sourceUrl: 'u', sourceTitle: 'Crudo', imageUrl: null, narrativeFrame: null, feedId: 'f', feed: { id: 'f', title: 'Angol Noticias', displayTitle: null, issue: { name: 'T', slug: 't' } } },
    },
  ])
})

describe('digest semanal con la vitrina de marca', () => {
  it('mezcla por fecha, enlaza la nota de marca a su ficha y codifica su título', async () => {
    await runSendCommunityDigest()
    const { body } = sendTransactional.mock.calls[0][0]
    expect(body).toContain('/comunidad/wallmapu-araucania/n/de-marca-abc')
    expect(body).toContain('/stories/nota-1')
    expect(body.indexOf('de-marca-abc')).toBeLessThan(body.indexOf('nota-1'))
    expect(body).not.toContain('<img src="https://evil.example')
    expect(body).toContain('2 noticias nuevas')
    // solo lo de la semana
    expect(mockPrisma.storyBrandAssessment.findMany.mock.calls[0][0].where.brandDate.gte).toBeInstanceOf(Date)
  })

  it('con la marca en sombra, solo lo publicado', async () => {
    marca.mode = 'shadow'
    await runSendCommunityDigest()
    const { body } = sendTransactional.mock.calls[0][0]
    expect(body).not.toContain('/comunidad/wallmapu-araucania/n/')
    expect(mockPrisma.storyBrandAssessment.findMany).not.toHaveBeenCalled()
  })

  it('manda como máximo cinco notas por vertical, aunque haya más en la semana', async () => {
    marca.mode = 'shadow'
    mockPrisma.story.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, title: `Nota ${i}`, slug: `nota-${i}`, summary: 'R', sourceTitle: 'F', datePublished: new Date(Date.UTC(2026, 9, 12 - i)), narrativeFrame: null, feedId: 'f' })),
    )
    await runSendCommunityDigest()
    const { body } = sendTransactional.mock.calls[0][0]
    expect((body.match(/\/stories\/nota-/g) ?? []).length).toBe(5)
  })
})
