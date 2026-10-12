import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetStoryIdsByStatus = vi.hoisted(() => vi.fn())
const mockPreAssessStories = vi.hoisted(() => vi.fn())

vi.mock('../services/story.js', () => ({
  getStoryIdsByStatus: mockGetStoryIdsByStatus,
}))
vi.mock('../services/analysis.js', () => ({
  preAssessStories: mockPreAssessStories,
}))

const { runPreassessStories } = await import('./preassessStories.js')

describe('runPreassessStories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pre-assesses all fetched stories', async () => {
    mockGetStoryIdsByStatus.mockResolvedValue(['story-1', 'story-2'])
    mockPreAssessStories.mockResolvedValue([
      { storyId: 'story-1', rating: 3, emotionTag: 'calm' },
      { storyId: 'story-2', rating: 5, emotionTag: 'calm' },
    ])

    await runPreassessStories()

    expect(mockGetStoryIdsByStatus).toHaveBeenCalledWith('fetched', { hoursAgo: 14 * 24 })
    expect(mockPreAssessStories).toHaveBeenCalledWith(['story-1', 'story-2'])
  })

  it('termina con error si el primer pase deja pasar menos de la mitad', async () => {
    // La corrida persiste lo que pudo, pero el scheduler tiene que enterarse:
    // antes esto aparecia como "completado" con 888 de 889 lotes caidos.
    const ids = Array.from({ length: 10 }, (_, i) => `story-${i}`)
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce(ids)          // pase 1
      .mockResolvedValueOnce(ids.slice(1)) // remaining tras el pase 1
      .mockResolvedValueOnce(ids.slice(1)) // pase 2
      .mockResolvedValue([])               // remaining tras el pase 2: nada
    mockPreAssessStories
      .mockResolvedValueOnce([{ storyId: 'story-0', rating: 3, emotionTag: 'calm', narrativeFrame: null }])
      .mockResolvedValueOnce(ids.slice(1).map(id => ({ storyId: id, rating: 3, emotionTag: 'calm', narrativeFrame: null })))

    await expect(runPreassessStories()).rejects.toThrow(/solo 1 de 10 historias pasaron en el primer pase \(10 %\)/)
    // El segundo pase igual corrio: el error no corta el trabajo, lo reporta.
    expect(mockPreAssessStories).toHaveBeenCalledTimes(2)
  })

  it('termina con error si el primer pase no avanza nada', async () => {
    mockGetStoryIdsByStatus.mockResolvedValue(['story-1', 'story-2'])
    mockPreAssessStories.mockResolvedValue([])

    await expect(runPreassessStories()).rejects.toThrow(/0 de 2 historias pasaron en el primer pase/)
    expect(mockPreAssessStories).toHaveBeenCalledTimes(1)
  })

  it('unos rezagados que no avanzan en un pase posterior no son un error', async () => {
    // 12-oct: la primera corrida sana hizo 4.135 de 4.145 y el ultimo lote de 10
    // volvio con un 400 de Azure en cada pase. Eso se registra, no se alerta.
    const ids = Array.from({ length: 20 }, (_, i) => `story-${i}`)
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce(ids)              // pase 1
      .mockResolvedValueOnce(['story-19'])     // remaining
      .mockResolvedValueOnce(['story-19'])     // pase 2
    mockPreAssessStories
      .mockResolvedValueOnce(ids.slice(0, 19).map(id => ({ storyId: id, rating: 2, emotionTag: 'calm', narrativeFrame: null })))
      .mockResolvedValueOnce([])

    await expect(runPreassessStories()).resolves.toBeUndefined()
    expect(mockPreAssessStories).toHaveBeenCalledTimes(2)
  })

  it('no lanza cuando el primer pase es sano aunque queden rezagadas', async () => {
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce(['story-1', 'story-2', 'story-3'])
      .mockResolvedValueOnce(['story-3'])
      .mockResolvedValueOnce(['story-3'])
      .mockResolvedValue([])
    mockPreAssessStories
      .mockResolvedValueOnce([
        { storyId: 'story-1', rating: 3, emotionTag: 'calm', narrativeFrame: 'alianza' },
        { storyId: 'story-2', rating: 5, emotionTag: 'calm', narrativeFrame: null },
      ])
      .mockResolvedValueOnce([{ storyId: 'story-3', rating: 2, emotionTag: 'calm', narrativeFrame: null }])

    await expect(runPreassessStories()).resolves.toBeUndefined()
  })

  it('does nothing when no fetched stories', async () => {
    mockGetStoryIdsByStatus.mockResolvedValue([])

    await runPreassessStories()

    expect(mockGetStoryIdsByStatus).toHaveBeenCalledWith('fetched', { hoursAgo: 14 * 24 })
    expect(mockPreAssessStories).not.toHaveBeenCalled()
  })
})
