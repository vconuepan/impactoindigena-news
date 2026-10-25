import { describe, it, expect, vi, beforeEach } from 'vitest'

// La clase real vive en lib/instagram.js, pero ese módulo está mockeado acá.
// Se define en el mock para que el `instanceof` del servicio compare contra la
// misma clase que el test lanza.
class InstagramAuthError extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.name = 'InstagramAuthError'
    this.code = code
  }
}

const mockLib = vi.hoisted(() => ({
  createCarouselPost: vi.fn(),
  createSingleImagePost: vi.fn(),
  getPostMetrics: vi.fn(),
  isInstagramConfigured: vi.fn(() => true),
}))

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
  instagramPost: {
    findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(),
    findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(),
  },
}))

// El carrusel desde el original se prueba en storyCarousel.test.ts; acá se
// simula, y se conservan los ayudantes reales (nombre de las láminas, error).
const mockCarrusel = vi.hoisted(() => ({
  buildStoryCarouselForSocial: vi.fn(),
  subirCarrusel: vi.fn(),
}))

const mockLLM = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../lib/instagram.js', () => ({ ...mockLib, InstagramAuthError }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('./storyCarousel.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storyCarousel.js')>()),
  ...mockCarrusel,
}))
vi.mock('./llm.js', () => ({
  getMediumLLM: () => ({ withStructuredOutput: () => ({ invoke: mockLLM.invoke }) }),
  rateLimitDelay: vi.fn(),
}))
vi.mock('../prompts/instagram.js', () => ({ buildInstagramCaptionPrompt: vi.fn(() => 'PROMPT') }))
vi.mock('../config.js', () => ({
  config: {
    instagram: { metrics: { maxAgeDays: 30 } },
    r2: { endpoint: 'https://r2.test', accessKeyId: 'k', secretAccessKey: 's', publicUrl: 'https://pub.r2.test' },
  },
}))

const { updateMetrics, updateDraft, generateDraft, publishPost, pieConAtribucion, cuerpoDelPie } = await import('./instagram.js')
const { buildInstagramCaptionPrompt } = await import('../prompts/instagram.js')
const { StoryCarouselError } = await import('./storyCarousel.js')

const posts = [
  { id: 'a', instagramPostId: '1791', status: 'published' },
  { id: 'b', instagramPostId: '1792', status: 'published' },
  { id: 'c', instagramPostId: '1793', status: 'published' },
]

describe('updateMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isInstagramConfigured.mockReturnValue(true)
    mockPrisma.instagramPost.findMany.mockResolvedValue(posts)
    mockPrisma.instagramPost.update.mockResolvedValue({})
  })

  // Regresión de la caída de julio de 2026. El bucle se tragaba el error de cada
  // post, el job terminaba "con éxito" y el scheduler nunca alertaba: 12 días
  // caído en silencio y 1956 llamadas inútiles a la API.
  it('aborts on the first dead-token error instead of hitting every post', async () => {
    mockLib.getPostMetrics.mockRejectedValue(
      new InstagramAuthError('Error validating access token: Session has expired', 190),
    )

    await expect(updateMetrics()).rejects.toThrow(InstagramAuthError)
    expect(mockLib.getPostMetrics).toHaveBeenCalledTimes(1)
  })

  it('keeps going when a single post fails for a non-auth reason', async () => {
    mockLib.getPostMetrics
      .mockRejectedValueOnce(new Error('Media ID is not available'))
      .mockResolvedValue({ likeCount: 7, commentCount: 2 })

    await updateMetrics()

    expect(mockLib.getPostMetrics).toHaveBeenCalledTimes(3)
    expect(mockPrisma.instagramPost.update).toHaveBeenCalledTimes(2)
  })

  it('writes the metrics it fetches', async () => {
    mockLib.getPostMetrics.mockResolvedValue({ likeCount: 12, commentCount: 3 })

    await updateMetrics()

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledTimes(3)
    expect(mockPrisma.instagramPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a' },
        data: expect.objectContaining({ likeCount: 12, commentCount: 3 }),
      }),
    )
  })
})

describe('updateDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.instagramPost.update.mockResolvedValue({})
  })

  // Regresión: publishPost acepta 'failed' para reintentar, pero updateDraft solo
  // aceptaba 'draft'. El panel guarda el caption antes de publicar, así que editar
  // un post fallido devolvía 400 y la publicación nunca corría. Se vio en vivo el
  // 30-jul-2026: dos PUT con 400 seguidos, cero intentos de publicación.
  it('allows editing a failed post so it can be retried', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ id: 'x', status: 'failed' })

    await updateDraft('x', 'caption corregido')

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'x' }, data: { caption: 'caption corregido' } }),
    )
  })

  it('still allows editing a draft', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ id: 'y', status: 'draft' })

    await updateDraft('y', 'otro caption')

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledTimes(1)
  })

  it('refuses to edit an already published post', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ id: 'z', status: 'published' })

    await expect(updateDraft('z', 'no')).rejects.toThrow('Can only edit draft posts')
    expect(mockPrisma.instagramPost.update).not.toHaveBeenCalled()
  })

  it('ignores captions for posts that do not exist', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue(null)

    await expect(updateDraft('nope', 'x')).rejects.toThrow('Post not found')
  })
})

describe('updateMetrics (writes)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isInstagramConfigured.mockReturnValue(true)
    mockPrisma.instagramPost.findMany.mockResolvedValue(posts)
    mockPrisma.instagramPost.update.mockResolvedValue({})
  })

  it('writes the metrics it fetches (regression guard)', async () => {
    mockLib.getPostMetrics.mockResolvedValue({ likeCount: 12, commentCount: 3 })

    await updateMetrics()

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledTimes(3)
    expect(mockPrisma.instagramPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a' },
        data: expect.objectContaining({ likeCount: 12, commentCount: 3 }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Desde el 25-oct-2026: el carrusel y el pie salen del artículo original
// ---------------------------------------------------------------------------

const ORIGINAL = 'El Lof Juan Currin, comunidad mapuche de Temuco, enfrenta una orden de desalojo. Radio Kurruf reporteó la declaración del lonkopalife.'
const LAMINAS_NUEVAS = [
  'https://pub.r2.test/social/s1-original-01-1.jpg',
  'https://pub.r2.test/social/s1-original-02-1.jpg',
]

function noticia() {
  return {
    id: 's1',
    title: 'Mapuches enfrentan desalojo',
    slug: 'mapuches-enfrentan-desalojo',
    sourceTitle: 'Lof Juan Currin enfrenta una nueva orden de desalojo',
    sourceContent: ORIGINAL,
    summary: 'RESUMEN DE VOCES QUE NO DEBE USARSE',
    relevanceReasons: '- **Uno:** dos\nlimitingFactors',
    feed: { url: 'https://radiokurruf.org/feed', title: 'Radio Kurruf' },
    issue: { name: 'Territorio' },
  }
}

function carrusel() {
  return {
    imagenes: [Buffer.from('a'), Buffer.from('b')],
    laminas: [],
    atribucion: { medio: 'Radio Kurruf', autor: null, fecha: null, tituloOriginal: 'x', dominio: 'radiokurruf.org' },
    original: ORIGINAL,
    originalParaElModelo: ORIGINAL,
  }
}

/** El último `update` del post, que es el estado en que quedó. */
function estadoFinal() {
  const llamadas = mockPrisma.instagramPost.update.mock.calls
  return llamadas[llamadas.length - 1][0].data
}

describe('generateDraft desde el artículo original', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.story.findUnique.mockResolvedValue(noticia())
    mockPrisma.instagramPost.findFirst.mockResolvedValue(null)
    mockPrisma.instagramPost.create.mockResolvedValue({ id: 'p1', status: 'generating' })
    mockPrisma.instagramPost.update.mockResolvedValue({})
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ id: 'p1', status: 'draft' })
    mockCarrusel.buildStoryCarouselForSocial.mockResolvedValue(carrusel())
    mockCarrusel.subirCarrusel.mockResolvedValue(LAMINAS_NUEVAS)
    mockLLM.invoke.mockResolvedValue({ caption: 'El Lof Juan Currin resiste en Temuco.\n\n#PueblosIndígenas #Mapuche' })
  })

  it('arma el pie desde el original, nombra al medio y sube las láminas', async () => {
    await generateDraft('s1', { esperar: true })

    expect(buildInstagramCaptionPrompt).toHaveBeenCalledWith(expect.objectContaining({
      sourceContent: ORIGINAL,
      publisher: 'Radio Kurruf',
    }))
    // Nada del resumen ni de las razones que escribe la IA de Voces.
    const entrada = vi.mocked(buildInstagramCaptionPrompt).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(Object.keys(entrada)).not.toEqual(expect.arrayContaining(['summary']))
    expect(Object.keys(entrada)).not.toEqual(expect.arrayContaining(['relevanceReasons']))

    const fin = estadoFinal()
    expect(fin.status).toBe('draft')
    expect(fin.slideUrls).toEqual(LAMINAS_NUEVAS)
    expect(fin.caption).toContain('Reporteó: Radio Kurruf')
    expect(fin.caption).toContain('https://vocesindigenas.org/stories/mapuches-enfrentan-desalojo')
  })

  // El job publica en la misma corrida: antes recibía un registro en
  // `generating` y fallaba con «Can only publish draft posts».
  it('con esperar, devuelve el post ya terminado', async () => {
    const post = await generateDraft('s1', { esperar: true })

    expect(post.status).toBe('draft')
    expect(mockPrisma.instagramPost.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }))
  })

  it('sin esperar (el panel), devuelve el registro en generating', async () => {
    const post = await generateDraft('s1')

    expect(post.status).toBe('generating')
  })

  it('si el carrusel no pasa los candados, queda rechazado y no se sube nada', async () => {
    mockCarrusel.buildStoryCarouselForSocial.mockRejectedValue(new StoryCarouselError(
      'El texto del carrusel no pasó los candados.',
      [{ lamina: 2, tipo: 'cifra', mensaje: 'La cifra «2024» no aparece en el artículo original.' }],
    ))

    await generateDraft('s1', { esperar: true })

    const fin = estadoFinal()
    expect(fin.status).toBe('rejected')
    expect(fin.error).toContain('«2024»')
    expect(mockLLM.invoke).not.toHaveBeenCalled()
    expect(mockCarrusel.subirCarrusel).not.toHaveBeenCalled()
  })

  it('si el pie atribuye un pueblo que el original no nombra, queda rechazado', async () => {
    mockLLM.invoke.mockResolvedValue({ caption: 'El Lof Juan Currin resiste.\n\n#PueblosIndígenas #Aymara' })

    await generateDraft('s1', { esperar: true })

    const fin = estadoFinal()
    expect(fin.status).toBe('rejected')
    expect(fin.error).toMatch(/^Pie: .*aymara/)
    expect(mockCarrusel.subirCarrusel).not.toHaveBeenCalled()
  })

  // Al cambiar de generador quedaron borradores armados con el resumen de IA
  // esperando en la base (el 25-oct, uno de los Ngäbe). No se publican: se rehacen.
  it('descarta un borrador del carrusel anterior y lo rehace desde el original', async () => {
    mockPrisma.instagramPost.findFirst.mockResolvedValue({
      id: 'viejo', status: 'draft', slideUrls: ['https://pub.r2.test/social/s1-slide1-1792832458341.jpg'],
    })

    await generateDraft('s1', { esperar: true })

    expect(mockPrisma.instagramPost.delete).toHaveBeenCalledWith({ where: { id: 'viejo' } })
    expect(mockPrisma.instagramPost.create).toHaveBeenCalled()
  })

  it('reabre tal cual un borrador ya armado desde el original', async () => {
    const existente = { id: 'nuevo', status: 'draft', slideUrls: LAMINAS_NUEVAS }
    mockPrisma.instagramPost.findFirst.mockResolvedValue(existente)

    const post = await generateDraft('s1', { esperar: true })

    expect(post).toBe(existente)
    expect(mockPrisma.instagramPost.create).not.toHaveBeenCalled()
  })

  it('un rechazado se rehace al pedirlo de nuevo', async () => {
    mockPrisma.instagramPost.findFirst.mockResolvedValue({ id: 'r', status: 'rejected', slideUrls: [] })

    await generateDraft('s1', { esperar: true })

    expect(mockPrisma.instagramPost.delete).toHaveBeenCalledWith({ where: { id: 'r' } })
  })
})

describe('publishPost, el único punto de salida', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isInstagramConfigured.mockReturnValue(true)
    mockPrisma.instagramPost.update.mockResolvedValue({ id: 'p1', status: 'publishing' })
    mockLib.createCarouselPost.mockResolvedValue({ id: 'ig-1', permalink: 'https://instagram.com/p/x' })
  })

  function post(extra: Record<string, unknown> = {}) {
    return {
      id: 'p1', status: 'draft', slideUrls: LAMINAS_NUEVAS, imageUrl: LAMINAS_NUEVAS[0],
      caption: 'El Lof Juan Currin resiste.\n\nReporteó: Radio Kurruf\nhttps://vocesindigenas.org/stories/familias-indigenas-x',
      story: noticia(),
      ...extra,
    }
  }

  it('publica un borrador armado desde el original', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue(post())

    await publishPost('p1')

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'publishing', error: null } }))
  })

  it('no publica un borrador del carrusel anterior', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue(post({ slideUrls: ['https://pub.r2.test/social/s1-slide1-1.jpg'] }))

    await expect(publishPost('p1')).rejects.toThrow(/carrusel anterior/)
    expect(mockPrisma.instagramPost.update).not.toHaveBeenCalled()
  })

  it('revisa otra vez el pie editado en el panel', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue(post({ caption: 'Las familias aymaras resisten.' }))

    await expect(publishPost('p1')).rejects.toThrow(/El pie no pasó los candados/)
    expect(mockPrisma.instagramPost.update).not.toHaveBeenCalled()
  })
})

describe('pieConAtribucion y cuerpoDelPie', () => {
  // La dirección de la ficha lleva el titular de Voces, que escribe la IA: los
  // candados revisan el texto del pie, no esa dirección.
  it('los candados leen el pie sin la atribución ni el enlace', () => {
    const pie = 'Texto.\n\nReporteó: Radio Kurruf\nhttps://vocesindigenas.org/stories/familias-indigenas-de-intag'
    expect(cuerpoDelPie(pie)).toBe('Texto.\n')
  })

  it('agrega el medio y el enlace al final', () => {
    expect(pieConAtribucion('Texto.', 'Radio Kurruf', 'https://v.org/s/x')).toBe('Texto.\n\nReporteó: Radio Kurruf\nhttps://v.org/s/x')
  })

  it('si no cabe, acorta el texto del modelo y nunca la atribución', () => {
    const pie = pieConAtribucion('a'.repeat(3000), 'Radio Kurruf', 'https://v.org/s/x')
    expect(pie.endsWith('\n\nReporteó: Radio Kurruf\nhttps://v.org/s/x')).toBe(true)
    // Cabe junto a la línea de IA que se agrega al publicar.
    expect(pie.length + 2 + 'Texto elaborado con apoyo de IA a partir de la noticia original.'.length).toBeLessThanOrEqual(2200)
  })
})
