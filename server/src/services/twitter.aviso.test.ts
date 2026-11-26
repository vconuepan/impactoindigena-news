/**
 * Regla 2 de la independencia editorial en X (director, 25-nov-2026): el aviso
 * corto va en la última línea del texto, antes del enlace, y nunca nombra a la
 * organización. Si no cabe en 275, cede el texto, nunca el aviso ni el enlace.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
  twitterPost: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  blueskyPost: { findFirst: vi.fn() },
}))
const mockTwitter = vi.hoisted(() => ({
  createTweet: vi.fn(),
  getTweetMetrics: vi.fn(),
  isTwitterConfigured: vi.fn(() => true),
}))
const mockAviso = vi.hoisted(() => ({ lineaDeAvisoParaPublicar: vi.fn(async () => null as string | null) }))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/twitter.js', () => mockTwitter)
vi.mock('./avisoClientes.js', () => mockAviso)

const { generateDraft, publishPost, textoDelTweet } = await import('./twitter.js')

const AVISO = 'Aviso: la nota menciona a un cliente de impactoindigena.legal.'
const URL_FICHA = 'https://impactoindigena.news/stories/la-nota'
const story = { id: 'story-1', slug: 'la-nota', title: 'T', summary: 'Resumen.', imageUrl: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(null)
  mockPrisma.story.findUnique.mockResolvedValue(story)
  mockPrisma.twitterPost.findFirst.mockResolvedValue(null)
  mockPrisma.twitterPost.create.mockImplementation(async ({ data }: any) => ({ id: 'p', ...data }))
  mockPrisma.twitterPost.update.mockImplementation(async ({ data }: any) => ({ id: 'p', ...data }))
  mockTwitter.createTweet.mockResolvedValue({ id: '1', url: 'https://x.com/1' })
})

describe('X · aviso de independencia (regla 2)', () => {
  it('con aviso: va en la última línea del texto, antes del enlace', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    mockPrisma.blueskyPost.findFirst.mockResolvedValue({ postText: 'Gancho.\nTema | found on Medio' })

    await generateDraft('story-1')

    expect(mockAviso.lineaDeAvisoParaPublicar).toHaveBeenCalledWith('story-1', 'corta')
    expect(mockPrisma.twitterPost.create.mock.calls[0][0].data.postText)
      .toBe(`Gancho.\nTema | found on Medio\n${AVISO}\n\n${URL_FICHA}`)
  })

  it('sin aviso: texto y enlace, como siempre', async () => {
    mockPrisma.blueskyPost.findFirst.mockResolvedValue({ postText: 'Gancho.' })

    await generateDraft('story-1')

    expect(mockPrisma.twitterPost.create.mock.calls[0][0].data.postText).toBe(`Gancho.\n\n${URL_FICHA}`)
  })

  it('el aviso del texto de Bluesky no se duplica ni se lo come el recorte', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    mockPrisma.blueskyPost.findFirst.mockResolvedValue({ postText: `${'g'.repeat(280)}\n${AVISO}` })

    await generateDraft('story-1')

    const texto = mockPrisma.twitterPost.create.mock.calls[0][0].data.postText as string
    expect(texto.length).toBeLessThanOrEqual(275)
    expect(texto.split(AVISO)).toHaveLength(2)
    expect(texto.endsWith(`…\n${AVISO}\n\n${URL_FICHA}`)).toBe(true)
  })

  it('al publicar pone el aviso de hoy, aunque el borrador no lo tuviera', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    mockPrisma.twitterPost.findUnique.mockResolvedValue({
      id: 'p', status: 'draft', postText: `Gancho.\n\n${URL_FICHA}`, imageUrl: null, story,
    })

    await publishPost('p')

    expect(mockTwitter.createTweet.mock.calls[0][0]).toBe(`Gancho.\n${AVISO}\n\n${URL_FICHA}`)
  })

  it('al publicar quita el aviso que ya no corresponde', async () => {
    mockPrisma.twitterPost.findUnique.mockResolvedValue({
      id: 'p', status: 'draft', postText: `Gancho.\n${AVISO}\n\n${URL_FICHA}`, imageUrl: null, story,
    })

    await publishPost('p')

    expect(mockTwitter.createTweet.mock.calls[0][0]).toBe(`Gancho.\n\n${URL_FICHA}`)
  })

  it('si el aviso no se puede calcular, no publica', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockRejectedValue(new Error('db down'))
    mockPrisma.twitterPost.findUnique.mockResolvedValue({
      id: 'p', status: 'draft', postText: 'Gancho.', imageUrl: null, story,
    })

    await expect(publishPost('p')).rejects.toThrow('db down')
    expect(mockTwitter.createTweet).not.toHaveBeenCalled()
  })

  it('textoDelTweet sin aviso deja el texto y el enlace', () => {
    expect(textoDelTweet('Gancho.', URL_FICHA, null)).toBe(`Gancho.\n\n${URL_FICHA}`)
  })
})
