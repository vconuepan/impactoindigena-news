import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Every channel flag starts off; each test turns on only what it needs.
const mockConfig = vi.hoisted(() => ({
  config: {
    bluesky: { autoPost: { enabled: false } },
    mastodon: { autoPost: { enabled: false } },
    twitter: { autoPost: { enabled: false } },
    instagram: { autoPost: { enabled: false } },
    linkedin: { autoPost: { enabled: false } },
    facebook: { autoPost: { enabled: false } },
    socialAutoPost: { lookbackHours: 25, intentosPorCanal: 3 },
  },
}))

const mockPrisma = vi.hoisted(() => ({
  blueskyPost: { findMany: vi.fn().mockResolvedValue([]) },
  mastodonPost: { findMany: vi.fn().mockResolvedValue([]) },
  twitterPost: { findMany: vi.fn().mockResolvedValue([]) },
  instagramPost: { findMany: vi.fn().mockResolvedValue([]) },
  linkedInPost: { findMany: vi.fn().mockResolvedValue([]) },
  facebookPost: { findMany: vi.fn().mockResolvedValue([]) },
}))

const mockSocial = vi.hoisted(() => ({
  findAutoPostCandidates: vi.fn(),
  pickBestStoryForSocial: vi.fn(),
}))

const mockChannels = vi.hoisted(() => ({
  instagram: { generateDraft: vi.fn(), publishPost: vi.fn() },
  linkedin: { generateDraft: vi.fn(), publishPost: vi.fn() },
  bluesky: { generateDraft: vi.fn(), publishPost: vi.fn() },
  facebook: { generateDraft: vi.fn(), publishPost: vi.fn() },
}))

vi.mock('../config.js', () => mockConfig)
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/socialMedia.js', () => mockSocial)
const mockWithheld = vi.hoisted(() => vi.fn(async (_ids: string[]) => new Set<string>()))
vi.mock('../services/communityReview.js', () => ({ withheldInEnforcedVerticals: mockWithheld }))
vi.mock('../lib/bluesky.js', () => ({ isBlueskyConfigured: () => true }))
vi.mock('../lib/mastodon.js', () => ({ isMastodonConfigured: () => true }))
vi.mock('../lib/twitter.js', () => ({ isTwitterConfigured: () => true }))
vi.mock('../lib/instagram.js', () => ({ isInstagramConfigured: () => true }))
vi.mock('../lib/linkedin.js', () => ({ isLinkedInConfigured: () => true }))
vi.mock('../lib/facebook.js', () => ({ isFacebookConfigured: () => true }))
vi.mock('../services/bluesky.js', () => mockChannels.bluesky)
vi.mock('../services/mastodon.js', () => ({ generateDraft: vi.fn(), publishPost: vi.fn() }))
vi.mock('../services/twitter.js', () => ({ generateDraft: vi.fn(), publishPost: vi.fn() }))
vi.mock('../services/instagram.js', () => mockChannels.instagram)
vi.mock('../services/linkedin.js', () => mockChannels.linkedin)
vi.mock('../services/facebook.js', () => mockChannels.facebook)

const { runSocialAutoPost } = await import('./socialAutoPost.js')

/** The channel list the job handed to candidate selection. */
function selectedChannelNames(): string[] {
  const [, channels] = mockSocial.findAutoPostCandidates.mock.calls[0]
  return (channels as Array<{ name: string }>).map((c) => c.name)
}

describe('runSocialAutoPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of ['bluesky', 'mastodon', 'twitter', 'instagram', 'linkedin', 'facebook'] as const) {
      mockConfig.config[key].autoPost.enabled = false
    }
    for (const table of Object.values(mockPrisma)) table.findMany.mockResolvedValue([])
    mockSocial.findAutoPostCandidates.mockResolvedValue([])
  })

  it('does nothing when no channel is enabled', async () => {
    await runSocialAutoPost()

    expect(mockSocial.findAutoPostCandidates).not.toHaveBeenCalled()
    expect(mockSocial.pickBestStoryForSocial).not.toHaveBeenCalled()
  })

  // Regression: LINKEDIN_AUTO_POST_ENABLED was read nowhere, so turning it on
  // posted nothing and gave no hint why.
  it('includes LinkedIn when its auto-post flag is on', async () => {
    mockConfig.config.linkedin.autoPost.enabled = true

    await runSocialAutoPost()

    expect(selectedChannelNames()).toContain('linkedin')
  })

  it('leaves LinkedIn out when its flag is off', async () => {
    mockConfig.config.bluesky.autoPost.enabled = true

    await runSocialAutoPost()

    expect(selectedChannelNames()).toEqual(['bluesky'])
  })

  it('includes Facebook when its auto-post flag is on', async () => {
    mockConfig.config.facebook.autoPost.enabled = true

    await runSocialAutoPost()

    expect(selectedChannelNames()).toContain('facebook')
  })

  it('drafts and publishes to the Facebook Page for the picked story', async () => {
    mockConfig.config.facebook.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockChannels.facebook.generateDraft.mockResolvedValue({ id: 'fb-1' })
    mockChannels.facebook.publishPost.mockResolvedValue(undefined)

    await runSocialAutoPost()

    expect(mockChannels.facebook.generateDraft).toHaveBeenCalledWith('story-1')
    expect(mockChannels.facebook.publishPost).toHaveBeenCalledWith('fb-1')
  })

  it('drafts and publishes to LinkedIn for the picked story', async () => {
    mockConfig.config.linkedin.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockChannels.linkedin.generateDraft.mockResolvedValue({ id: 'post-1' })
    mockChannels.linkedin.publishPost.mockResolvedValue(undefined)

    await runSocialAutoPost()

    expect(mockChannels.linkedin.generateDraft).toHaveBeenCalledWith('story-1')
    expect(mockChannels.linkedin.publishPost).toHaveBeenCalledWith('post-1')
  })

  it('skips a channel that already published the picked story', async () => {
    mockConfig.config.linkedin.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockPrisma.linkedInPost.findMany.mockResolvedValue([{ storyId: 'story-1' }])

    await runSocialAutoPost()

    expect(mockChannels.linkedin.generateDraft).not.toHaveBeenCalled()
  })

  // One channel blowing up must not cost the others their turn.
  it('keeps posting to other channels after one fails', async () => {
    mockConfig.config.bluesky.autoPost.enabled = true
    mockConfig.config.linkedin.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockChannels.bluesky.generateDraft.mockRejectedValue(new Error('bluesky down'))
    mockChannels.linkedin.generateDraft.mockResolvedValue({ id: 'post-1' })
    mockChannels.linkedin.publishPost.mockResolvedValue(undefined)

    await expect(runSocialAutoPost()).resolves.toBeUndefined()

    expect(mockChannels.linkedin.publishPost).toHaveBeenCalledWith('post-1')
  })

  // Decision del director, 2026-10-11: lo que una vertical en enforce no muestra
  // no sale a redes. Entre elegir la nota y publicarla pasan una eleccion del LLM,
  // un borrador por canal y 2 s entre canales: se vuelve a mirar antes de cada
  // publicacion, porque un post no se deshace.
  it('stops before publishing if a vertical in enforce withheld the story during the run', async () => {
    mockConfig.config.bluesky.autoPost.enabled = true
    mockConfig.config.linkedin.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockChannels.bluesky.generateDraft.mockResolvedValue({ id: 'bsky-1' })
    mockWithheld.mockResolvedValueOnce(new Set(['story-1']))

    await runSocialAutoPost()

    expect(mockWithheld).toHaveBeenCalledWith(['story-1'])
    expect(mockChannels.bluesky.publishPost).not.toHaveBeenCalled()
    expect(mockChannels.linkedin.generateDraft).not.toHaveBeenCalled()
    expect(mockChannels.linkedin.publishPost).not.toHaveBeenCalled()
  })

  it('checks again before each channel and publishes while the story stays visible', async () => {
    mockConfig.config.linkedin.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockChannels.linkedin.generateDraft.mockResolvedValue({ id: 'post-1' })
    mockChannels.linkedin.publishPost.mockResolvedValue(undefined)

    await runSocialAutoPost()

    expect(mockWithheld).toHaveBeenCalledTimes(1)
    expect(mockChannels.linkedin.publishPost).toHaveBeenCalledWith('post-1')
  })

  // Decisión del director, 25-oct-2026: Instagram arma el carrusel desde el
  // artículo original y, sin editor, un aviso de los candados lo rechaza.
  describe('Instagram', () => {
    beforeEach(() => {
      mockConfig.config.instagram.autoPost.enabled = true
      mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
      mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
      mockChannels.instagram.publishPost.mockResolvedValue(undefined)
    })

    // Antes publicaba un registro todavía en `generating` y fallaba con «Can only
    // publish draft posts»; el borrador salía en otra corrida, si se reelegía.
    it('espera el borrador y lo publica en la misma corrida', async () => {
      mockChannels.instagram.generateDraft.mockResolvedValue({ id: 'ig-1', status: 'draft' })

      await runSocialAutoPost()

      expect(mockChannels.instagram.generateDraft).toHaveBeenCalledWith('story-1', { esperar: true })
      expect(mockChannels.instagram.publishPost).toHaveBeenCalledWith('ig-1')
    })

    it('no publica un borrador rechazado por los candados', async () => {
      mockChannels.instagram.generateDraft.mockResolvedValue({ id: 'ig-1', status: 'rejected' })

      await runSocialAutoPost()

      expect(mockChannels.instagram.publishPost).not.toHaveBeenCalled()
    })

    // B21, 19-nov-2026: del 6 al 19-nov Instagram perdió 9 de 27 franjas porque
    // un rechazo dejaba al canal sin publicar. Ahora prueba con la siguiente.
    describe('siguiente candidata tras un rechazo (B21)', () => {
      beforeEach(() => {
        mockConfig.config.socialAutoPost.intentosPorCanal = 3
        mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1', 'story-2', 'story-3', 'story-4'])
      })

      // `clearAllMocks` no vacía las respuestas en cola (`mockResolvedValueOnce`):
      // una que sobre se colaría en el test siguiente. Los `beforeEach` de arriba
      // vuelven a poner los valores por defecto.
      afterEach(() => {
        mockSocial.pickBestStoryForSocial.mockReset()
        mockChannels.instagram.generateDraft.mockReset()
        mockChannels.linkedin.generateDraft.mockReset()
        mockPrisma.instagramPost.findMany.mockReset()
      })

      it('publica la siguiente mejor cuando la elegida se rechaza', async () => {
        mockSocial.pickBestStoryForSocial
          .mockResolvedValueOnce({ storyId: 'story-1', reasoning: 'best' })
          .mockResolvedValueOnce({ storyId: 'story-2', reasoning: 'next' })
        mockChannels.instagram.generateDraft
          .mockResolvedValueOnce({ id: 'ig-1', status: 'rejected' })
          .mockResolvedValueOnce({ id: 'ig-2', status: 'draft' })

        await runSocialAutoPost()

        expect(mockChannels.instagram.generateDraft).toHaveBeenNthCalledWith(2, 'story-2', { esperar: true })
        expect(mockChannels.instagram.publishPost).toHaveBeenCalledTimes(1)
        expect(mockChannels.instagram.publishPost).toHaveBeenCalledWith('ig-2')
        // Comprueba antes de publicar que la nueva siga visible, igual que con la primera.
        expect(mockWithheld).toHaveBeenCalledWith(['story-2'])
      })

      it('un borrador que falló al generarse no se publica: prueba la siguiente', async () => {
        mockSocial.pickBestStoryForSocial
          .mockResolvedValueOnce({ storyId: 'story-1', reasoning: 'best' })
          .mockResolvedValueOnce({ storyId: 'story-2', reasoning: 'next' })
        mockChannels.instagram.generateDraft
          .mockResolvedValueOnce({ id: 'ig-1', status: 'failed' })
          .mockResolvedValueOnce({ id: 'ig-2', status: 'draft' })

        await runSocialAutoPost()

        expect(mockChannels.instagram.publishPost).toHaveBeenCalledTimes(1)
        expect(mockChannels.instagram.publishPost).toHaveBeenCalledWith('ig-2')
      })

      it('la siguiente sale de las que quedan: ni la ya probada ni las que el canal ya resolvió', async () => {
        mockSocial.pickBestStoryForSocial
          .mockResolvedValueOnce({ storyId: 'story-1', reasoning: 'best' })
          .mockResolvedValueOnce({ storyId: 'story-4', reasoning: 'next' })
        // story-1 sin fila al empezar; tras su rechazo, el canal ya tiene story-1 y story-3 resueltas.
        mockPrisma.instagramPost.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ storyId: 'story-1' }, { storyId: 'story-3' }])
        mockChannels.instagram.generateDraft
          .mockResolvedValueOnce({ id: 'ig-1', status: 'rejected' })
          .mockResolvedValueOnce({ id: 'ig-4', status: 'draft' })

        await runSocialAutoPost()

        expect(mockSocial.pickBestStoryForSocial).toHaveBeenNthCalledWith(2, ['story-2', 'story-4'])
        expect(mockChannels.instagram.publishPost).toHaveBeenCalledWith('ig-4')
      })

      it('respeta el tope de intentos y no publica nada si todos se rechazan', async () => {
        mockSocial.pickBestStoryForSocial
          .mockResolvedValueOnce({ storyId: 'story-1', reasoning: 'best' })
          .mockResolvedValueOnce({ storyId: 'story-2', reasoning: 'next' })
          .mockResolvedValueOnce({ storyId: 'story-3', reasoning: 'next' })
        mockChannels.instagram.generateDraft.mockResolvedValue({ id: 'ig-x', status: 'rejected' })

        await runSocialAutoPost()

        expect(mockChannels.instagram.generateDraft).toHaveBeenCalledTimes(3)
        expect(mockChannels.instagram.publishPost).not.toHaveBeenCalled()
      })

      it('con tope 1 se comporta como antes: un rechazo y el canal no publica', async () => {
        mockConfig.config.socialAutoPost.intentosPorCanal = 1
        mockSocial.pickBestStoryForSocial.mockResolvedValueOnce({ storyId: 'story-1', reasoning: 'best' })
        mockChannels.instagram.generateDraft.mockResolvedValue({ id: 'ig-1', status: 'rejected' })

        await runSocialAutoPost()

        expect(mockChannels.instagram.generateDraft).toHaveBeenCalledTimes(1)
        expect(mockSocial.pickBestStoryForSocial).toHaveBeenCalledTimes(1)
      })

      it('sin más candidatas para el canal, se detiene sin otra elección del modelo', async () => {
        mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
        mockSocial.pickBestStoryForSocial.mockResolvedValueOnce({ storyId: 'story-1', reasoning: 'best' })
        mockChannels.instagram.generateDraft.mockResolvedValue({ id: 'ig-1', status: 'rejected' })

        await runSocialAutoPost()

        expect(mockSocial.pickBestStoryForSocial).toHaveBeenCalledTimes(1)
        expect(mockChannels.instagram.generateDraft).toHaveBeenCalledTimes(1)
      })

      it('los demás canales publican la elegida, no la de reemplazo', async () => {
        mockConfig.config.linkedin.autoPost.enabled = true
        mockSocial.pickBestStoryForSocial
          .mockResolvedValueOnce({ storyId: 'story-1', reasoning: 'best' })
          .mockResolvedValueOnce({ storyId: 'story-2', reasoning: 'next' })
        mockChannels.instagram.generateDraft
          .mockResolvedValueOnce({ id: 'ig-1', status: 'rejected' })
          .mockResolvedValueOnce({ id: 'ig-2', status: 'draft' })
        mockChannels.linkedin.generateDraft.mockResolvedValue({ id: 'li-1' })

        await runSocialAutoPost()

        expect(mockChannels.linkedin.generateDraft).toHaveBeenCalledWith('story-1')
        expect(mockChannels.instagram.publishPost).toHaveBeenCalledWith('ig-2')
      })
    })

    // Si no, el job volvería a elegir la misma noticia en cada corrida.
    it('cuenta una noticia rechazada como resuelta en Instagram', async () => {
      mockPrisma.instagramPost.findMany.mockResolvedValue([{ storyId: 'story-1' }])

      await runSocialAutoPost()

      expect(mockPrisma.instagramPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { storyId: { in: ['story-1'] }, status: { in: ['published', 'rejected'] } },
      }))
      expect(mockChannels.instagram.generateDraft).not.toHaveBeenCalled()
    })

    it('los otros canales siguen contando solo lo publicado', async () => {
      mockConfig.config.instagram.autoPost.enabled = false
      mockConfig.config.linkedin.autoPost.enabled = true
      mockChannels.linkedin.generateDraft.mockResolvedValue({ id: 'li-1' })

      await runSocialAutoPost()

      expect(mockPrisma.linkedInPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { storyId: { in: ['story-1'] }, status: { in: ['published'] } },
      }))
    })
  })
})
