/**
 * Regla 2 de la independencia editorial en la Página de Facebook (director,
 * 25-nov-2026): el aviso largo es el párrafo final, antes de la línea de IA, y
 * nunca nombra a la organización.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_LABEL } from '../lib/ai-label.js'

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
  facebookPost: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
const mockFacebook = vi.hoisted(() => ({
  createPagePost: vi.fn(),
  getPostMetrics: vi.fn(),
  isFacebookConfigured: vi.fn(() => true),
  FacebookAuthError: class extends Error {},
}))
const mockLlm = vi.hoisted(() => ({ invoke: vi.fn() }))
const mockAviso = vi.hoisted(() => ({ lineaDeAvisoParaPublicar: vi.fn(async () => null as string | null) }))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/facebook.js', () => mockFacebook)
vi.mock('./llm.js', () => ({
  getMediumLLM: vi.fn(() => ({ withStructuredOutput: vi.fn(() => mockLlm) })),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../prompts/facebook.js', () => ({ buildFacebookPostPrompt: vi.fn(() => 'prompt') }))
vi.mock('./avisoClientes.js', () => mockAviso)

const { generateDraft, publishPost } = await import('./facebook.js')

const AVISO = 'Aviso de independencia: esta nota menciona a una organización que fue cliente de impactoindigena.legal.'
const story = { id: 'story-1', slug: 'la-nota', title: 'T', titleLabel: null, summary: 'S', feed: null, issue: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(null)
  mockPrisma.story.findUnique.mockResolvedValue(story)
  mockPrisma.facebookPost.findFirst.mockResolvedValue(null)
  mockPrisma.facebookPost.create.mockImplementation(async ({ data }: any) => ({ id: 'p', ...data }))
  mockPrisma.facebookPost.update.mockImplementation(async ({ data }: any) => ({ id: 'p', ...data }))
  mockLlm.invoke.mockResolvedValue({ postText: 'La comunidad decidió.' })
  mockFacebook.createPagePost.mockResolvedValue({ id: '1_2', permalink: 'https://fb/1_2' })
})

describe('Facebook · aviso de independencia (regla 2)', () => {
  it('con aviso: el borrador lo lleva como párrafo final', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    await generateDraft('story-1')
    expect(mockAviso.lineaDeAvisoParaPublicar).toHaveBeenCalledWith('story-1', 'larga')
    expect(mockPrisma.facebookPost.create.mock.calls[0][0].data.postText).toBe(`La comunidad decidió.\n\n${AVISO}`)
  })

  it('sin aviso: el borrador es el texto del modelo', async () => {
    await generateDraft('story-1')
    expect(mockPrisma.facebookPost.create.mock.calls[0][0].data.postText).toBe('La comunidad decidió.')
  })

  it('al publicar: el aviso va antes de la línea de IA, aunque el borrador editado lo haya borrado', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    mockPrisma.facebookPost.findUnique.mockResolvedValue({ id: 'p', status: 'draft', postText: 'Texto editado.', story })

    await publishPost('p')

    expect(mockFacebook.createPagePost.mock.calls[0][0]).toBe(`Texto editado.\n\n${AVISO}\n\n${AI_LABEL}`)
  })

  it('al publicar sin aviso: texto y línea de IA, nada más', async () => {
    mockPrisma.facebookPost.findUnique.mockResolvedValue({ id: 'p', status: 'draft', postText: `Texto.\n\n${AVISO}`, story })

    await publishPost('p')

    expect(mockFacebook.createPagePost.mock.calls[0][0]).toBe(`Texto.\n\n${AI_LABEL}`)
  })

  it('si el aviso no se puede calcular, no publica y queda failed', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockRejectedValue(new Error('db down'))
    mockPrisma.facebookPost.findUnique.mockResolvedValue({ id: 'p', status: 'draft', postText: 'Texto.', story })

    await expect(publishPost('p')).rejects.toThrow('db down')
    expect(mockFacebook.createPagePost).not.toHaveBeenCalled()
    expect(mockPrisma.facebookPost.update.mock.calls[0][0].data).toMatchObject({ status: 'failed' })
  })
})
