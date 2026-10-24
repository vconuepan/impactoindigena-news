import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

// El logo se baja del sitio: en los tests no hay red, y la lámina sale sin él.
vi.mock('@napi-rs/canvas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@napi-rs/canvas')>()
  return { ...real, loadImage: vi.fn().mockRejectedValue(new Error('sin red en los tests')) }
})

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))

const mockLLM = vi.hoisted(() => ({
  invoke: vi.fn(),
  withStructuredOutput: vi.fn(),
}))
vi.mock('../../services/llm.js', () => ({
  getLLMByTier: () => ({ withStructuredOutput: mockLLM.withStructuredOutput }),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

const STORY_ID = '33333333-3333-4333-8333-333333333333'

const ORIGINAL = [
  'La comunidad mapuche Txokin Pehuen, de Curarrehue, presentó este martes su plan de manejo del bosque nativo ante la Corporación Nacional Forestal.',
  '"Este bosque es nuestra farmacia y nuestra escuela", dijo la lonko María Huenchullán durante la reunión con las autoridades regionales.',
  'El plan abarca 320 hectáreas y prioriza la recolección de piñones, la protección de las vertientes y la restauración de las laderas quemadas en 2023.',
  'Según la comunidad, el trabajo comenzó hace cuatro años con talleres en la escuela rural y con el apoyo de técnicos forestales de la zona.',
  'La Corporación Nacional Forestal informó que revisará el documento durante noviembre y que su aprobación permitiría postular a fondos de restauración.',
  'Vecinos de la comuna valoraron la iniciativa y pidieron que el plan incluya la limpieza de los caminos interiores antes de la temporada de incendios.',
].join(' ').repeat(2)

function noticia(overrides: Record<string, any> = {}) {
  return {
    id: STORY_ID,
    slug: 'comunidad-txokin-pehuen-presenta-plan-de-bosque',
    sourceUrl: 'https://www.biobiochile.cl/noticias/2026/10/21/plan-bosque.shtml',
    sourceTitle: 'Comunidad de Curarrehue presenta plan para su bosque',
    sourceContent: ORIGINAL,
    sourceAuthor: 'Equipo BioBío',
    sourceDatePublished: new Date('2026-10-21T15:00:00Z'),
    summary: 'RESUMEN DE VOCES QUE NO DEBE USARSE',
    status: 'published',
    feed: { title: 'Google News', displayTitle: null },
    issue: { name: 'Territorio' },
    ...overrides,
  }
}

const LAMINAS = [
  { titulo: 'La comunidad Txokin Pehuen presenta su plan para el bosque nativo', texto: 'En Curarrehue, la comunidad llevó su plan de manejo a la Corporación Nacional Forestal este martes.' },
  { titulo: 'Bosque y escuela', texto: 'La lonko María Huenchullán dijo: «Este bosque es nuestra farmacia y nuestra escuela».' },
  { titulo: 'Qué abarca', texto: 'El plan cubre 320 hectáreas y prioriza los piñones, las vertientes y la restauración de las laderas quemadas en 2023.' },
  { titulo: 'Qué viene', texto: 'La Corporación Nacional Forestal revisará el documento durante noviembre.' },
]

function respuestaDelModelo(parsed: any) {
  mockLLM.invoke.mockResolvedValue({ raw: { usage_metadata: { input_tokens: 3000, output_tokens: 700 } }, parsed })
  mockLLM.withStructuredOutput.mockReturnValue({ invoke: mockLLM.invoke })
}

describe('Carrusel de una noticia (admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.story.findUnique.mockResolvedValue(noticia())
    respuestaDelModelo({ laminas: LAMINAS })
  })

  it('exige sesión', async () => {
    const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).send({})
    expect(res.status).toBe(401)
  })

  describe('POST /:id/carousel (texto)', () => {
    it('arma el texto desde el artículo original, no desde el resumen de Voces', async () => {
      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.status).toBe(200)
      const prompt = mockLLM.invoke.mock.calls[0][0][0].content as string
      expect(prompt).toContain('Txokin Pehuen')
      expect(prompt).not.toContain('RESUMEN DE VOCES')
      expect(res.body.laminas).toHaveLength(4)
      expect(res.body.lectura).toBeNull()
      expect(res.body.avisos).toEqual([])
    })

    it('atribuye al medio real aunque el feed se llame Google News', async () => {
      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.body.atribucion).toEqual({
        medio: 'BioBío Chile',
        autor: 'Equipo BioBío',
        fecha: '21 de octubre de 2026',
        tituloOriginal: 'Comunidad de Curarrehue presenta plan para su bosque',
        dominio: 'biobiochile.cl',
      })
    })

    it('si el dominio no está en el mapa, firma con el nombre del feed del medio', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(noticia({
        sourceUrl: 'https://ictnews.org/news/a-first-nation-community',
        feed: { title: 'Indian Country Today', displayTitle: null },
      }))

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.body.atribucion.medio).toBe('Indian Country Today')
    })

    it('si el feed es Google News y el dominio no está en el mapa, firma con el dominio', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(noticia({
        sourceUrl: 'https://enestrado.com/tercer-tribunal-ambiental',
        feed: { title: 'Google News — Búsqueda Indígena', displayTitle: 'Google News' },
      }))

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.body.atribucion.medio).toBe('enestrado.com')
    })

    it('quita la firma que el modelo pega en el texto: la dibuja el código', async () => {
      respuestaDelModelo({ laminas: [...LAMINAS.slice(0, 3), { titulo: 'Qué viene', texto: 'La revisión será en noviembre. Reporteó: biobiochile.cl' }] })

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.body.laminas[3].texto).toBe('La revisión será en noviembre.')
    })

    it('con lectura, devuelve la lámina en la voz del director', async () => {
      respuestaDelModelo({ laminas: LAMINAS, lectura: { titulo: 'Construir desde el bosque', texto: 'A mi juicio, el plan muestra cómo se ejerce la autodeterminación.' } })

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({ conLectura: true })

      expect(res.status).toBe(200)
      expect(res.body.lectura.titulo).toBe('Construir desde el bosque')
      expect(mockLLM.invoke.mock.calls[0][0][0].content).toContain('<LECTURA>')
    })

    it('avisa una cita que no está tal cual en el original', async () => {
      respuestaDelModelo({ laminas: [...LAMINAS.slice(0, 3), { titulo: 'Qué viene', texto: 'Un vecino dijo «el bosque es de todos».' }] })

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.body.avisos).toEqual([expect.objectContaining({ lamina: 3, tipo: 'cita' })])
    })

    it('no arma un carrusel que no puede atribuir: la dirección quedó en Google News', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(noticia({ sourceUrl: 'https://news.google.com/rss/articles/abc' }))

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.status).toBe(422)
      expect(res.body.error).toMatch(/Google News/)
      expect(mockLLM.invoke).not.toHaveBeenCalled()
    })

    it('no arma un carrusel con un original demasiado corto', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(noticia({ sourceContent: 'Bajada del feed.' }))

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.status).toBe(422)
      expect(res.body.error).toMatch(/16 caracteres/)
      expect(mockLLM.invoke).not.toHaveBeenCalled()
    })

    it('404 si la noticia no existe', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(null)

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel`).set(authHeader()).send({})

      expect(res.status).toBe(404)
    })
  })

  describe('POST /:id/carousel/preview', () => {
    it('dibuja una imagen por lámina, con la lectura antes del cierre', async () => {
      const lectura = { titulo: 'Construir desde el bosque', texto: 'A mi juicio, el plan muestra un camino.' }
      const res = await request(app)
        .post(`/api/admin/stories/${STORY_ID}/carousel/preview`)
        .set(authHeader())
        .send({ laminas: LAMINAS, lectura })

      expect(res.status).toBe(200)
      expect(res.body.avisos).toEqual([])
      expect(res.body.imagenes).toHaveLength(5)
      for (const img of res.body.imagenes) expect(img).toMatch(/^data:image\/jpeg;base64,\/9j\//)
    }, 30_000)

    it('vuelve a revisar el texto editado: «indígena» sin respaldo en el original', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(noticia({
        sourceContent: 'Diecinueve familias y comunidades locales de Intag organizaron mingas para frenar la hidroeléctrica. '.repeat(15),
      }))
      const laminas = [
        { titulo: 'Familias indígenas frenan una hidroeléctrica', texto: 'Diecinueve familias de Intag organizaron mingas.' },
        { titulo: 'Qué viene', texto: 'La obra sigue en discusión.' },
      ]

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel/preview`).set(authHeader()).send({ laminas })

      expect(res.status).toBe(200)
      expect(res.body.avisos).toEqual([expect.objectContaining({ lamina: 0, tipo: 'identidad' })])
    }, 30_000)

    it('avisa un texto que no cabe en vez de recortarlo', async () => {
      const largo = 'El plan de manejo cubre trescientas veinte hectáreas de bosque nativo. '.repeat(12)
      const laminas = [LAMINAS[0], { titulo: 'Qué abarca', texto: largo }, LAMINAS[3]]

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel/preview`).set(authHeader()).send({ laminas })

      expect(res.body.avisos).toEqual([expect.objectContaining({ lamina: 1, tipo: 'espacio' })])
    }, 30_000)

    it('rechaza un carrusel sin portada y cierre', async () => {
      const res = await request(app)
        .post(`/api/admin/stories/${STORY_ID}/carousel/preview`)
        .set(authHeader())
        .send({ laminas: [LAMINAS[0]] })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /:id/carousel/download', () => {
    it('entrega un ZIP con una imagen por lámina y el PDF', async () => {
      const res = await request(app)
        .post(`/api/admin/stories/${STORY_ID}/carousel/download`)
        .set(authHeader())
        .send({ laminas: LAMINAS })
        .buffer(true)
        .parse((r, cb) => {
          const partes: Buffer[] = []
          r.on('data', (c: Buffer) => partes.push(c))
          r.on('end', () => cb(null, Buffer.concat(partes)))
        })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('application/zip')
      expect(res.headers['content-disposition']).toContain('carrusel-comunidad-txokin-pehuen-presenta-plan-de-bosque.zip')
      const zip = res.body as Buffer
      expect(zip.subarray(0, 2).toString()).toBe('PK')
      const nombres = zip.toString('latin1')
      for (let i = 1; i <= 4; i++) expect(nombres).toContain(`lamina-0${i}.jpg`)
      expect(nombres).not.toContain('lamina-05.jpg')
      expect(nombres).toContain('carrusel-comunidad-txokin-pehuen-presenta-plan-de-bosque.pdf')
    }, 30_000)

    it('no entrega nada mientras haya avisos', async () => {
      const laminas = [...LAMINAS.slice(0, 3), { titulo: 'Qué viene', texto: 'Un vecino dijo «el bosque es de todos».' }]

      const res = await request(app).post(`/api/admin/stories/${STORY_ID}/carousel/download`).set(authHeader()).send({ laminas })

      expect(res.status).toBe(422)
      expect(res.body.avisos).toEqual([expect.objectContaining({ lamina: 3, tipo: 'cita' })])
    }, 30_000)
  })
})
