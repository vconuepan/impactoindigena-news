import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  story: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  },
  newsletter: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  podcast: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  feed: {
    findUnique: vi.fn(),
  },
  storyCluster: {
    delete: vi.fn(),
  },
  $disconnect: vi.fn(),
  $transaction: vi.fn((args: any) => Array.isArray(args) ? Promise.all(args) : args()),
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const { getStoryIdsByStatus, generateUniqueSlugs, getStories, deleteStory, dissolveCluster, getClusterRedirectSlug, getPublishedStories, getHomepageData } = await import('./story.js')

describe('getStories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('excludes sourceContent from admin list query', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.story.count.mockResolvedValue(0)

    await getStories({})

    const call = mockPrisma.story.findMany.mock.calls[0][0]
    expect(call.select).toBeDefined()
    expect(call.select.sourceContent).toBeUndefined()
    expect(call.select.id).toBe(true)
    expect(call.select.title).toBe(true)
    expect(call.select.status).toBe(true)
    expect(call.select.feed).toBeDefined()
  })

  it('applies search filter with OR on title, sourceTitle, summary', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.story.count.mockResolvedValue(0)

    await getStories({ search: 'climate' })

    const call = mockPrisma.story.findMany.mock.calls[0][0]
    expect(call.where.AND).toHaveLength(1)
    expect(call.where.AND[0].OR).toEqual([
      { title: { contains: 'climate', mode: 'insensitive' } },
      { sourceTitle: { contains: 'climate', mode: 'insensitive' } },
      { summary: { contains: 'climate', mode: 'insensitive' } },
    ])
  })

  it('combines search and rating filters via AND', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.story.count.mockResolvedValue(0)

    await getStories({ search: 'AI', rating: 'gte5' })

    const call = mockPrisma.story.findMany.mock.calls[0][0]
    // Both should be combined via AND
    expect(call.where.AND).toHaveLength(2)
    // Rating condition
    expect(call.where.AND[0].OR).toEqual([
      { relevance: { gte: 5 } },
      { relevance: null, relevancePre: { gte: 5 } },
    ])
    // Search condition
    expect(call.where.AND[1].OR).toEqual([
      { title: { contains: 'AI', mode: 'insensitive' } },
      { sourceTitle: { contains: 'AI', mode: 'insensitive' } },
      { summary: { contains: 'AI', mode: 'insensitive' } },
    ])
    // OR should not be on where directly
    expect(call.where.OR).toBeUndefined()
  })

  it('includes feed with issue in select', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.story.count.mockResolvedValue(0)

    await getStories({})

    const call = mockPrisma.story.findMany.mock.calls[0][0]
    expect(call.select.feed.select.id).toBe(true)
    expect(call.select.feed.select.title).toBe(true)
    expect(call.select.feed.select.issue).toBeDefined()
  })
})

describe('getStoryIdsByStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns story IDs filtered by status', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'id-1' },
      { id: 'id-2' },
    ])

    const result = await getStoryIdsByStatus('analyzed')

    expect(result).toEqual(['id-1', 'id-2'])
    expect(mockPrisma.story.findMany).toHaveBeenCalledWith({
      where: { status: 'analyzed' },
      select: { id: true },
      orderBy: { dateCrawled: 'desc' },
    })
  })

  it('returns empty array when no stories match', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const result = await getStoryIdsByStatus('published')

    expect(result).toEqual([])
  })

  it('applies ratingMin filter (relevancePre >= value)', async () => {
    mockPrisma.story.findMany.mockResolvedValue([{ id: 'id-3' }])

    await getStoryIdsByStatus('pre_analyzed', { ratingMin: 3 })

    expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'pre_analyzed',
          relevancePre: { gte: 3 },
        },
      }),
    )
  })

  it('applies relevanceMin filter (relevance >= value)', async () => {
    mockPrisma.story.findMany.mockResolvedValue([{ id: 'id-4' }])

    await getStoryIdsByStatus('analyzed', { relevanceMin: 5 })

    expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'analyzed',
          relevance: { gte: 5 },
        },
      }),
    )
  })

  it('applies hoursAgo filter (dateCrawled >= now - hours)', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    mockPrisma.story.findMany.mockResolvedValue([])

    await getStoryIdsByStatus('fetched', { hoursAgo: 24 })

    const expectedDate = new Date(now - 24 * 60 * 60 * 1000)
    expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'fetched',
          dateCrawled: { gte: expectedDate },
        },
      }),
    )

    vi.restoreAllMocks()
  })

  it('applies limit option as take parameter', async () => {
    mockPrisma.story.findMany.mockResolvedValue([{ id: 'id-5' }])

    await getStoryIdsByStatus('analyzed', { limit: 10 })

    expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
      }),
    )
  })

  it('does not include take when limit is not provided', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    await getStoryIdsByStatus('fetched')

    const call = mockPrisma.story.findMany.mock.calls[0][0]
    expect(call).not.toHaveProperty('take')
  })

  it('combines multiple filter options', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    mockPrisma.story.findMany.mockResolvedValue([{ id: 'id-6' }])

    await getStoryIdsByStatus('pre_analyzed', {
      ratingMin: 3,
      relevanceMin: 5,
      hoursAgo: 48,
      limit: 20,
    })

    expect(mockPrisma.story.findMany).toHaveBeenCalledWith({
      where: {
        status: 'pre_analyzed',
        relevancePre: { gte: 3 },
        relevance: { gte: 5 },
        dateCrawled: { gte: new Date(now - 48 * 60 * 60 * 1000) },
      },
      select: { id: true },
      orderBy: { dateCrawled: 'desc' },
      take: 20,
    })

    vi.restoreAllMocks()
  })
})

describe('generateUniqueSlugs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty map for empty input', async () => {
    const result = await generateUniqueSlugs([])

    expect(result).toEqual(new Map())
    expect(mockPrisma.story.findMany).not.toHaveBeenCalled()
  })

  it('generates slugs from titles', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const result = await generateUniqueSlugs([
      { id: 's1', title: 'Hello World', sourceTitle: 'Source Title' },
    ])

    expect(result.get('s1')).toBe('hello-world')
  })

  it('falls back to sourceTitle when title is null', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const result = await generateUniqueSlugs([
      { id: 's1', title: null, sourceTitle: 'My Source Article' },
    ])

    expect(result.get('s1')).toBe('my-source-article')
  })

  it('resolves conflicts with existing slugs in database', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { slug: 'hello-world' },
    ])

    const result = await generateUniqueSlugs([
      { id: 's1', title: 'Hello World', sourceTitle: 'Source' },
    ])

    expect(result.get('s1')).toBe('hello-world-2')
  })

  it('resolves conflicts within the same batch', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const result = await generateUniqueSlugs([
      { id: 's1', title: 'Same Title', sourceTitle: 'Source 1' },
      { id: 's2', title: 'Same Title', sourceTitle: 'Source 2' },
      { id: 's3', title: 'Same Title', sourceTitle: 'Source 3' },
    ])

    expect(result.get('s1')).toBe('same-title')
    expect(result.get('s2')).toBe('same-title-2')
    expect(result.get('s3')).toBe('same-title-3')
  })

  it('resolves conflicts with both existing and batch slugs', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { slug: 'hello-world' },
      { slug: 'hello-world-2' },
    ])

    const result = await generateUniqueSlugs([
      { id: 's1', title: 'Hello World', sourceTitle: 'Source' },
      { id: 's2', title: 'Hello World', sourceTitle: 'Source' },
    ])

    expect(result.get('s1')).toBe('hello-world-3')
    expect(result.get('s2')).toBe('hello-world-4')
  })

  it('excludes the stories being processed from the conflict check', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    await generateUniqueSlugs([
      { id: 's1', title: 'Test Article', sourceTitle: 'Source' },
    ])

    expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: ['s1'] },
          slug: { not: null },
        }),
      }),
    )
  })

  it('queries DB with unique base slugs for conflict detection', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    await generateUniqueSlugs([
      { id: 's1', title: 'Alpha', sourceTitle: 'S1' },
      { id: 's2', title: 'Beta', sourceTitle: 'S2' },
      { id: 's3', title: 'Alpha', sourceTitle: 'S3' },
    ])

    const call = mockPrisma.story.findMany.mock.calls[0][0]
    // Should have OR conditions for unique bases only (alpha and beta)
    expect(call.where.OR).toHaveLength(2)
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { slug: { startsWith: 'alpha' } },
        { slug: { startsWith: 'beta' } },
      ]),
    )
  })

  it('handles special characters in titles', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const result = await generateUniqueSlugs([
      { id: 's1', title: 'AI & Machine Learning: 2024 Update!', sourceTitle: 'Source' },
    ])

    // slugify converts special chars to hyphens
    expect(result.get('s1')).toBe('ai-machine-learning-2024-update')
  })

  it('returns correct map size for multiple stories', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const result = await generateUniqueSlugs([
      { id: 's1', title: 'Article One', sourceTitle: 'Source 1' },
      { id: 's2', title: 'Article Two', sourceTitle: 'Source 2' },
      { id: 's3', title: 'Article Three', sourceTitle: 'Source 3' },
    ])

    expect(result.size).toBe(3)
    expect(result.get('s1')).toBe('article-one')
    expect(result.get('s2')).toBe('article-two')
    expect(result.get('s3')).toBe('article-three')
  })
})

describe('deleteStory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes story and removes its ID from newsletters and podcasts', async () => {
    mockPrisma.story.delete.mockResolvedValue({})
    mockPrisma.newsletter.findMany.mockResolvedValue([
      { id: 'nl-1', storyIds: ['s1', 's2', 's3'] },
    ])
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: 'p-1', storyIds: ['s1', 's3'] },
    ])
    mockPrisma.newsletter.update.mockResolvedValue({})
    mockPrisma.podcast.update.mockResolvedValue({})

    await deleteStory('s1')

    expect(mockPrisma.story.delete).toHaveBeenCalledWith({ where: { id: 's1' } })
    expect(mockPrisma.newsletter.update).toHaveBeenCalledWith({
      where: { id: 'nl-1' },
      data: { storyIds: ['s2', 's3'] },
    })
    expect(mockPrisma.podcast.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { storyIds: ['s3'] },
    })
  })

  it('does not update newsletters/podcasts that do not contain the deleted story', async () => {
    mockPrisma.story.delete.mockResolvedValue({})
    mockPrisma.newsletter.findMany.mockResolvedValue([])
    mockPrisma.podcast.findMany.mockResolvedValue([])

    await deleteStory('s99')

    expect(mockPrisma.newsletter.update).not.toHaveBeenCalled()
    expect(mockPrisma.podcast.update).not.toHaveBeenCalled()
  })
})

describe('dissolveCluster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws error when story is not in a cluster', async () => {
    mockPrisma.story.findUnique.mockResolvedValue({ clusterId: null })

    await expect(dissolveCluster('s1')).rejects.toThrow('Story is not in a cluster')
  })

  it('throws error when story is not found', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(null)

    await expect(dissolveCluster('s-missing')).rejects.toThrow('Story is not in a cluster')
  })

  it('restores rejected members to analyzed, removes all from cluster, deletes cluster record', async () => {
    mockPrisma.story.findUnique.mockResolvedValue({ clusterId: 'cluster-1' })
    mockPrisma.story.updateMany.mockResolvedValue({ count: 2 })
    mockPrisma.storyCluster.delete.mockResolvedValue({})

    await dissolveCluster('s1')

    // First updateMany: restore rejected members to analyzed
    expect(mockPrisma.story.updateMany).toHaveBeenCalledWith({
      where: { clusterId: 'cluster-1', status: 'rejected' },
      data: { status: 'analyzed' },
    })

    // Second updateMany: remove all members from cluster
    expect(mockPrisma.story.updateMany).toHaveBeenCalledWith({
      where: { clusterId: 'cluster-1' },
      data: { clusterId: null },
    })

    // Delete the cluster record
    expect(mockPrisma.storyCluster.delete).toHaveBeenCalledWith({
      where: { id: 'cluster-1' },
    })
  })

  it('calls updateMany twice and storyCluster.delete once', async () => {
    mockPrisma.story.findUnique.mockResolvedValue({ clusterId: 'cluster-2' })
    mockPrisma.story.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.storyCluster.delete.mockResolvedValue({})

    await dissolveCluster('s2')

    expect(mockPrisma.story.updateMany).toHaveBeenCalledTimes(2)
    expect(mockPrisma.storyCluster.delete).toHaveBeenCalledTimes(1)
  })
})

describe('getClusterRedirectSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns primary slug for non-primary cluster member', async () => {
    mockPrisma.story.findFirst.mockResolvedValue({
      id: 'story-member',
      cluster: {
        primaryStoryId: 'story-primary',
        primaryStory: { slug: 'primary-story-slug', status: 'published' },
      },
    })

    const result = await getClusterRedirectSlug('old-member-slug')

    expect(result).toBe('primary-story-slug')
    expect(mockPrisma.story.findFirst).toHaveBeenCalledWith({
      where: { slug: 'old-member-slug', clusterId: { not: null } },
      select: expect.objectContaining({
        id: true,
        cluster: expect.any(Object),
      }),
    })
  })

  it('returns null when story is not in a cluster', async () => {
    mockPrisma.story.findFirst.mockResolvedValue(null)

    const result = await getClusterRedirectSlug('non-clustered-slug')

    expect(result).toBeNull()
  })

  it('returns null when story is the primary', async () => {
    mockPrisma.story.findFirst.mockResolvedValue({
      id: 'story-primary',
      cluster: {
        primaryStoryId: 'story-primary',
        primaryStory: { slug: 'primary-slug', status: 'published' },
      },
    })

    const result = await getClusterRedirectSlug('primary-slug')

    expect(result).toBeNull()
  })

  it('returns null when primary story is not published', async () => {
    mockPrisma.story.findFirst.mockResolvedValue({
      id: 'story-member',
      cluster: {
        primaryStoryId: 'story-primary',
        primaryStory: { slug: 'primary-slug', status: 'analyzed' },
      },
    })

    const result = await getClusterRedirectSlug('member-slug')

    expect(result).toBeNull()
  })

  it('returns null when primary story has no slug', async () => {
    mockPrisma.story.findFirst.mockResolvedValue({
      id: 'story-member',
      cluster: {
        primaryStoryId: 'story-primary',
        primaryStory: { slug: null, status: 'published' },
      },
    })

    const result = await getClusterRedirectSlug('member-slug')

    expect(result).toBeNull()
  })
})

/**
 * La jerarquia madre -> hija.
 *
 * De esto depende el modelo entero de subcategorias: una historia archivada en
 * "Territorio y Tierras" tiene que aparecer al consultar su madre. `buildIssueCondition`
 * ya lo resolvia con `{ parent: { slug } }` desde el eje geografico de agosto,
 * pero ni un test lo cubria: los tests de portada construyen issues con
 * `parentId: null` siempre. Sin esto, romper la herencia no falla ninguna suite.
 */
describe('secciones con subcategorias (jerarquia madre/hija)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.story.count.mockResolvedValue(0)
  })

  /** Aplana el `where` a texto para poder afirmar sobre su forma sin acoplarse al orden de las claves. */
  const condicionDe = (where: unknown) => JSON.stringify(where)

  it('una seccion incluye las historias de sus subcategorias', async () => {
    await getPublishedStories({ page: 1, pageSize: 10, issueSlug: 'derechos-indigenas' })

    const { where } = mockPrisma.story.findMany.mock.calls[0][0]
    const texto = condicionDe(where)
    // La via directa: la historia esta en la madre.
    expect(texto).toContain('"slug":"derechos-indigenas"')
    // La via heredada: la historia esta en una hija cuya madre es esta seccion.
    expect(texto).toContain('"parent":{"slug":"derechos-indigenas"}')
  })

  it('la portada tambien hereda de las subcategorias', async () => {
    await getHomepageData(['derechos-indigenas'], 7)

    const { where } = mockPrisma.story.findMany.mock.calls[0][0]
    expect(condicionDe(where)).toContain('"parent":{"slug":"derechos-indigenas"}')
  })

  it('una seccion no absorbe las hijas de otra', async () => {
    await getPublishedStories({ page: 1, pageSize: 10, issueSlug: 'cultura-y-conocimientos-ancestrales' })

    const texto = condicionDe(mockPrisma.story.findMany.mock.calls[0][0].where)
    expect(texto).toContain('"parent":{"slug":"cultura-y-conocimientos-ancestrales"}')
    expect(texto).not.toContain('derechos-indigenas')
  })

  it('la portada emite UNA consulta por seccion, no una por tono emocional', async () => {
    // El costo de la portada es `secciones x consultas`. Con tres consultas por
    // seccion, ocho secciones mas las verticales emitian 36 simultaneas contra
    // un pool de tres a cinco conexiones. Este test fija el reparto en una.
    await getHomepageData(['a', 'b', 'c'], 7)
    expect(mockPrisma.story.findMany).toHaveBeenCalledTimes(3)
  })

  it('reparte los tres tonos desde una sola consulta', async () => {
    const fila = (id: string, emotionTag: string) => ({ id, emotionTag })
    mockPrisma.story.findMany.mockResolvedValue([
      fila('u1', 'uplifting'), fila('c1', 'calm'), fila('n1', 'frustrating'),
      fila('n2', 'scary'), fila('u2', 'uplifting'),
    ])

    const { storiesByIssue } = await getHomepageData(['derechos-indigenas'], 7)
    const seccion = storiesByIssue['derechos-indigenas']

    expect(seccion.uplifting.map((s: any) => s.id)).toEqual(['u1', 'u2'])
    expect(seccion.calm.map((s: any) => s.id)).toEqual(['c1'])
    expect(seccion.negative.map((s: any) => s.id)).toEqual(['n1', 'n2'])
  })

  it('no devuelve mas historias por tono de las que se piden', async () => {
    mockPrisma.story.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, emotionTag: 'uplifting' })),
    )

    const { storiesByIssue } = await getHomepageData(['derechos-indigenas'], 7)
    expect(storiesByIssue['derechos-indigenas'].uplifting).toHaveLength(7)
  })
})

/**
 * Secciones geograficas de uno y de varios paises.
 *
 * `GEOGRAPHIC_ISSUE_COUNTRIES` paso de un pais por seccion a una lista, porque
 * Latinoamerica agrupa veinticuatro. Con un solo pais se filtra por igualdad
 * —lo que el indice de `country_focus` resuelve mas rapido— y con varios por
 * `IN`. Los dos caminos son distintos y los dos tienen que funcionar.
 */
describe('secciones geograficas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.story.count.mockResolvedValue(0)
  })

  it('Chile filtra por igualdad, no por IN', async () => {
    await getPublishedStories({ page: 1, pageSize: 10, issueSlug: 'chile-indigena' })

    const texto = JSON.stringify(mockPrisma.story.findMany.mock.calls[0][0].where)
    expect(texto).toContain('"countryFocus":"CL"')
    expect(texto).not.toContain('"countryFocus":{"in"')
  })

  it('Latinoamerica filtra por IN e incluye a Chile, Mexico y Brasil', async () => {
    await getPublishedStories({ page: 1, pageSize: 10, issueSlug: 'latinoamerica' })

    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    const texto = JSON.stringify(where)
    expect(texto).toContain('"countryFocus":{"in"')
    for (const pais of ['CL', 'MX', 'BR', 'GT', 'PE']) {
      expect(texto).toContain(`"${pais}"`)
    }
    // Y NO arrastra paises de fuera de la region.
    expect(texto).not.toContain('"CA"')
    expect(texto).not.toContain('"AU"')
  })

  it('una seccion tematica no filtra por pais', async () => {
    await getPublishedStories({ page: 1, pageSize: 10, issueSlug: 'derechos-indigenas' })

    expect(JSON.stringify(mockPrisma.story.findMany.mock.calls[0][0].where)).not.toContain('countryFocus')
  })
})
