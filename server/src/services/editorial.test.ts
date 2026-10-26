import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  editorial: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}))

const mockInvoke = vi.hoisted(() => vi.fn())

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./llm.js', () => ({
  getLLMByTier: vi.fn(() => ({
    withStructuredOutput: vi.fn(() => ({ invoke: mockInvoke })),
  })),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}))

const {
  EditorialError,
  generateEditorialContent,
  publishEditorial,
  razonesParaNoPublicar,
  toPublicEditorial,
  limpiarContenido,
  formatForLinkedIn,
} = await import('./editorial.js')

const notas =
  'Esta semana Diputados aprobó en Argentina la ley de inviolabilidad de la propiedad privada, con desalojos exprés y 124 votos a favor. Mi lectura: no se trata de orden público, sino de una disputa de propiedad no resuelta desde 1881. Propongo mirar Waitangi.'

function editorial(parcial: Record<string, unknown> = {}) {
  return {
    id: 'ed-1',
    title: 'Desalojos exprés',
    content: '',
    status: 'draft',
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    notes: notas,
    authorName: 'Venancio Coñuepán Mesías',
    method: '',
    sources: '',
    ...parcial,
  }
}

describe('generateEditorialContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.editorial.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => editorial(data))
  })

  it('se niega sin notas suficientes y dice por qué', async () => {
    mockPrisma.editorial.findUnique.mockResolvedValue(editorial({ notes: 'Desalojos.' }))
    await expect(generateEditorialContent('ed-1')).rejects.toBeInstanceOf(EditorialError)
    await expect(generateEditorialContent('ed-1')).rejects.toThrow(/al menos 200/)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('redacta desde las notas, limpia la firma pegada, fija el método y devuelve los avisos', async () => {
    mockPrisma.editorial.findUnique.mockResolvedValue(editorial())
    mockInvoke.mockResolvedValue({
      title: 'La propiedad no es un derecho absoluto',
      content: 'Las comunidades mapuche enfrentan una ley con 300 artículos.\n\nA mi juicio, Waitangi.\n\n— Venancio Coñuepán Mesías',
    })

    const resultado = await generateEditorialContent('ed-1')

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    const data = mockPrisma.editorial.update.mock.calls[0][0].data
    expect(data.content).not.toMatch(/— Venancio/)
    expect(data.method).toBe('ia_revisada')
    expect(data.title).toBe('La propiedad no es un derecho absoluto')
    // «300» no está en las notas: aviso informativo, no bloquea.
    expect(resultado.avisos.map((a) => a.tipo)).toEqual(['cifra'])
  })

  it('no pisa un método que el autor ya fijó', async () => {
    mockPrisma.editorial.findUnique.mockResolvedValue(editorial({ method: 'humana' }))
    mockInvoke.mockResolvedValue({ title: 'T', content: 'Las comunidades resisten.' })
    await generateEditorialContent('ed-1')
    expect(mockPrisma.editorial.update.mock.calls[0][0].data.method).toBe('humana')
  })
})

describe('publishEditorial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.editorial.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => editorial(data))
  })

  it('sin firma no se publica', async () => {
    mockPrisma.editorial.findUnique.mockResolvedValue(editorial({ content: 'Las comunidades resisten.', authorName: '', method: 'humana' }))
    await expect(publishEditorial('ed-1')).rejects.toThrow(/Falta la firma/)
    expect(mockPrisma.editorial.update).not.toHaveBeenCalled()
  })

  it('sin método no se publica', async () => {
    mockPrisma.editorial.findUnique.mockResolvedValue(editorial({ content: 'Las comunidades resisten.', method: '' }))
    await expect(publishEditorial('ed-1')).rejects.toThrow(/Falta el método/)
  })

  it('con el medio de sujeto en la primera frase no se publica', async () => {
    mockPrisma.editorial.findUnique.mockResolvedValue(
      editorial({ content: 'En Voces Indígenas creemos que la ley es grave. Las comunidades resisten.', method: 'humana' }),
    )
    await expect(publishEditorial('ed-1')).rejects.toThrow(/primera frase/)
  })

  it('con texto, firma y método se publica', async () => {
    mockPrisma.editorial.findUnique.mockResolvedValue(editorial({ content: 'Las comunidades resisten.', method: 'ia_revisada' }))
    await publishEditorial('ed-1')
    expect(mockPrisma.editorial.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'published' }) }),
    )
  })

  it('razonesParaNoPublicar lista todo lo que falta, en orden', () => {
    const razones = razonesParaNoPublicar({ content: '', authorName: '', method: '', notes: '' })
    expect(razones).toHaveLength(3)
    expect(razones[0]).toMatch(/no tiene texto/)
    expect(razones[1]).toMatch(/firma/)
    expect(razones[2]).toMatch(/método/)
  })
})

describe('toPublicEditorial', () => {
  it('nunca devuelve las notas del director', () => {
    const publica = toPublicEditorial(editorial({ status: 'published', method: 'ia_revisada', sources: 'Mongabay' }))
    expect(publica).not.toHaveProperty('notes')
    expect(publica).toMatchObject({ authorName: 'Venancio Coñuepán Mesías', method: 'ia_revisada', sources: 'Mongabay' })
  })

  it('una editorial anterior a las columnas sale con campos vacíos, no rotos', () => {
    const vieja = { id: 'x', title: 'T', content: 'C', status: 'published', publishedAt: null, createdAt: new Date(), updatedAt: new Date() }
    expect(toPublicEditorial(vieja)).toMatchObject({ authorName: '', method: '', sources: '' })
  })
})

describe('lectura con respaldo cuando faltan las columnas del 26-oct-2026', () => {
  // Medido en vivo el 26-oct-2026 01:39Z: el código llegó antes que el SQL y
  // /api/editorials respondió 500 con P2022 («editorials.notes does not exist»).
  const p2022 = Object.assign(new Error('The column `editorials.notes` does not exist'), { code: 'P2022' })
  const vieja = { id: 'ed-1', title: 'T', content: 'C', status: 'published', publishedAt: null, createdAt: new Date(), updatedAt: new Date() }

  beforeEach(() => vi.clearAllMocks())

  it('getEditorials repite con las columnas anteriores y rellena las nuevas vacías', async () => {
    mockPrisma.editorial.findMany.mockRejectedValueOnce(p2022).mockResolvedValueOnce([vieja])
    mockPrisma.editorial.count.mockResolvedValue(1)
    const { getEditorials } = await import('./editorial.js')
    const resultado = await getEditorials({ status: 'published' })
    expect(resultado.data).toHaveLength(1)
    expect(resultado.data[0]).toMatchObject({ id: 'ed-1', notes: '', authorName: '', method: '', sources: '' })
    expect(mockPrisma.editorial.findMany.mock.calls[1][0].select).toBeDefined()
  })

  it('getEditorialById hace lo mismo y devuelve null si no existe', async () => {
    mockPrisma.editorial.findUnique.mockRejectedValueOnce(p2022).mockResolvedValueOnce(vieja)
    const { getEditorialById } = await import('./editorial.js')
    expect(await getEditorialById('ed-1')).toMatchObject({ id: 'ed-1', authorName: '' })
    mockPrisma.editorial.findUnique.mockResolvedValueOnce(null)
    expect(await getEditorialById('nada')).toBeNull()
  })

  it('cualquier otro error se propaga', async () => {
    mockPrisma.editorial.findMany.mockRejectedValueOnce(new Error('caída'))
    const { getEditorials } = await import('./editorial.js')
    await expect(getEditorials({})).rejects.toThrow('caída')
  })
})

describe('limpiarContenido y formatForLinkedIn', () => {
  it('quita una firma pegada por el modelo y normaliza los párrafos', () => {
    expect(limpiarContenido('Uno.\r\n\r\n\r\nDos.\n\n—  Venancio Coñuepán')).toBe('Uno.\n\nDos.')
  })

  it('LinkedIn lleva la firma desde authorName', () => {
    const texto = formatForLinkedIn({ title: 'T', content: 'Uno.\n\nDos.', authorName: 'Venancio Coñuepán Mesías' })
    expect(texto).toContain('Dos.\n\n— Venancio Coñuepán Mesías\n\n#')
  })
})
