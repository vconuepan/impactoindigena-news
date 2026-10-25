import { describe, it, expect, vi, beforeEach } from 'vitest'

// El logo se baja del sitio: en los tests no hay red, y la lámina sale sin él.
vi.mock('@napi-rs/canvas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@napi-rs/canvas')>()
  return { ...real, loadImage: vi.fn().mockRejectedValue(new Error('sin red en los tests')) }
})

const mockPrisma = vi.hoisted(() => ({ story: { findUnique: vi.fn() } }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockLLM = vi.hoisted(() => ({ invoke: vi.fn(), withStructuredOutput: vi.fn() }))
vi.mock('./llm.js', () => ({
  getLLMByTier: () => ({ withStructuredOutput: mockLLM.withStructuredOutput }),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))

const mockUpload = vi.hoisted(() => vi.fn(async (_b: Buffer, nombre: string) => `https://r2.test/social/${nombre}`))
vi.mock('../lib/imageStorage.js', () => ({ uploadImageToR2: mockUpload }))

const { buildStoryCarouselForSocial, subirCarrusel, armadoDesdeElOriginal, StoryCarouselError } = await import('./storyCarousel.js')

const ORIGINAL = [
  'La comunidad mapuche Txokin Pehuen, de Curarrehue, presentó este martes su plan de manejo del bosque nativo ante la Corporación Nacional Forestal.',
  '"Este bosque es nuestra farmacia y nuestra escuela", dijo la lonko María Huenchullán durante la reunión con las autoridades regionales.',
  'El plan abarca 320 hectáreas y prioriza la recolección de piñones, la protección de las vertientes y la restauración de las laderas quemadas en 2023.',
  'La Corporación Nacional Forestal informó que revisará el documento durante noviembre y que su aprobación permitiría postular a fondos de restauración.',
].join(' ').repeat(3)

function noticia() {
  return {
    id: 'story-1',
    slug: 'comunidad-txokin-pehuen-presenta-plan-de-bosque',
    sourceUrl: 'https://www.biobiochile.cl/noticias/2026/10/21/plan-bosque.shtml',
    sourceTitle: 'Comunidad de Curarrehue presenta plan para su bosque',
    sourceContent: ORIGINAL,
    sourceAuthor: null,
    sourceDatePublished: new Date('2026-10-21T15:00:00Z'),
    summary: 'RESUMEN DE VOCES QUE NO DEBE USARSE',
    feed: { title: 'BioBioChile', displayTitle: null },
    issue: { name: 'Territorio' },
  }
}

const FIEL = [
  { titulo: 'La comunidad Txokin Pehuen presenta su plan para el bosque nativo', texto: 'En Curarrehue, la comunidad llevó su plan de manejo a la Corporación Nacional Forestal.' },
  { titulo: 'Bosque y escuela', texto: 'La lonko María Huenchullán dijo que el bosque es su farmacia y su escuela.' },
  { titulo: 'Qué abarca', texto: 'El plan cubre 320 hectáreas y prioriza los piñones y las vertientes.' },
  { titulo: 'Qué viene', texto: 'La Corporación Nacional Forestal revisará el documento durante noviembre.' },
]

function elModeloDevuelve(laminas: Array<{ titulo: string; texto: string }>) {
  mockLLM.invoke.mockResolvedValue({ raw: { usage_metadata: {} }, parsed: { laminas } })
  mockLLM.withStructuredOutput.mockReturnValue({ invoke: mockLLM.invoke })
}

describe('buildStoryCarouselForSocial (Instagram y LinkedIn, sin editor)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.story.findUnique.mockResolvedValue(noticia())
  })

  it('dibuja una lámina por cada una del texto, desde el original', async () => {
    elModeloDevuelve(FIEL)

    const carrusel = await buildStoryCarouselForSocial('story-1')

    expect(carrusel.imagenes).toHaveLength(FIEL.length)
    expect(carrusel.atribucion.medio).toBe('BioBío Chile')
    expect(carrusel.original).toBe(ORIGINAL)
    // El modelo recibe el artículo original, nunca el resumen de Voces.
    const prompt = mockLLM.invoke.mock.calls[0][0][0].content as string
    expect(prompt).toContain('Txokin Pehuen')
    expect(prompt).not.toContain('RESUMEN DE VOCES')
  })

  // Sin editor que corrija, un aviso no se muestra: rechaza.
  it('rechaza el carrusel con un año que el original no trae', async () => {
    elModeloDevuelve([
      ...FIEL.slice(0, 3),
      { titulo: 'Qué viene', texto: 'La Corporación Nacional Forestal revisará el documento en noviembre de 2025.' },
    ])

    const error = await buildStoryCarouselForSocial('story-1').catch((e) => e)

    expect(error).toBeInstanceOf(StoryCarouselError)
    expect(error.avisos.map((a: { tipo: string }) => a.tipo)).toEqual(['cifra'])
  })

  it('rechaza el carrusel que dice «indígena» sobre una nota que no lo dice', async () => {
    mockPrisma.story.findUnique.mockResolvedValue({
      ...noticia(),
      sourceContent: 'Diecinueve familias y comunidades locales de Intag organizaron mingas para frenar la hidroeléctrica. '.repeat(20),
    })
    elModeloDevuelve([
      { titulo: 'Familias indígenas frenan una represa', texto: 'En Intag, diecinueve familias organizaron mingas.' },
      { titulo: 'Mingas', texto: 'Las comunidades locales se organizaron.' },
      { titulo: 'Qué sigue', texto: 'Las familias siguen organizadas.' },
    ])

    const error = await buildStoryCarouselForSocial('story-1').catch((e) => e)

    expect(error).toBeInstanceOf(StoryCarouselError)
    expect(error.avisos.map((a: { tipo: string }) => a.tipo)).toContain('identidad')
  })
})

describe('las láminas armadas desde el original', () => {
  beforeEach(() => vi.clearAllMocks())

  it('se suben con la marca en el nombre, en orden', async () => {
    const urls = await subirCarrusel('story-1', [Buffer.from('a'), Buffer.from('b')])

    expect(urls).toHaveLength(2)
    expect(urls[0]).toMatch(/\/story-1-original-01-\d+\.jpg$/)
    expect(urls[1]).toMatch(/\/story-1-original-02-\d+\.jpg$/)
    expect(armadoDesdeElOriginal(urls)).toBe(true)
  })

  it('distinguen un borrador del carrusel anterior, que no se publica', () => {
    // Así nombraba las láminas el carrusel armado con el resumen de IA.
    const anterior = ['https://pub.r2.dev/social/8b95a474-slide1-1792832458341.jpg']
    expect(armadoDesdeElOriginal(anterior)).toBe(false)
    expect(armadoDesdeElOriginal([])).toBe(false)
  })
})
