import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Hoisted mocks ---

const mockPrisma = vi.hoisted(() => ({
  $disconnect: vi.fn().mockResolvedValue(undefined),
}))

const mockInitScheduler = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockStopScheduler = vi.hoisted(() => vi.fn())

const mockGetProcessingStoryIds = vi.hoisted(() => vi.fn().mockReturnValue([]))
const mockTaskRegistryDestroy = vi.hoisted(() => vi.fn())
// La limpieza de registros sin fecha corre en el callback de listen, al importar
// el módulo; se guardan los argumentos aparte porque clearAllMocks los borraría.
const llamadasBorrar = vi.hoisted(() => [] as unknown[][])
const mockBorrar = vi.hoisted(() => vi.fn(async (...args: unknown[]) => { llamadasBorrar.push(args); return [] as string[] }))

const mockServerClose = vi.hoisted(() => vi.fn((cb: () => void) => cb()))
const mockListen = vi.hoisted(() =>
  vi.fn((_port: unknown, cb: () => void) => {
    cb()
    return { close: mockServerClose }
  })
)

const mockApp = vi.hoisted(() => ({
  listen: mockListen,
}))

// --- Module mocks ---

vi.mock('./lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  borrarRegistrosSinFecha: mockBorrar,
  logDir: 'logs-de-prueba',
  retentionDays: 14,
}))
vi.mock('./jobs/scheduler.js', () => ({
  initScheduler: mockInitScheduler,
  stopScheduler: mockStopScheduler,
}))
vi.mock('./lib/taskRegistry.js', () => ({
  taskRegistry: {
    getProcessingStoryIds: mockGetProcessingStoryIds,
    destroy: mockTaskRegistryDestroy,
  },
}))
vi.mock('./app.js', () => ({ default: mockApp }))
vi.mock('./services/auth.js', () => ({
  cleanupExpiredTokens: vi.fn().mockResolvedValue(undefined),
  generateMemberToken: vi.fn().mockReturnValue('mock-member-token'),
}))

// Set required env vars before importing index.ts (it validates them at startup)
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long' // gitleaks:allow
process.env.OPENAI_API_KEY = 'test-openai-api-key-for-unit-tests'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

// Import after mocks are set up
const indexModule = await import('./index.js')

describe('server index', () => {
  const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    indexModule._resetShutdownState()
    mockGetProcessingStoryIds.mockReturnValue([])
    mockServerClose.mockImplementation((cb: () => void) => cb())
    mockPrisma.$disconnect.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('al arrancar borra los registros sin fecha vencidos, con el directorio y los días configurados', () => {
    expect(llamadasBorrar).toEqual([['logs-de-prueba', 14]])
  })

  describe('shutdown()', () => {
    it('stops scheduler, closes server, destroys task registry, and disconnects prisma', async () => {
      const shutdownPromise = indexModule.shutdown()
      // Advance past any polling intervals
      await vi.advanceTimersByTimeAsync(1000)
      await shutdownPromise

      expect(mockStopScheduler).toHaveBeenCalledTimes(1)
      expect(mockServerClose).toHaveBeenCalledTimes(1)
      expect(mockTaskRegistryDestroy).toHaveBeenCalledTimes(1)
      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1)
    })

    it('calls shutdown steps in correct order: scheduler, server, drain, prisma', async () => {
      const callOrder: string[] = []
      mockStopScheduler.mockImplementation(() => { callOrder.push('stopScheduler') })
      mockServerClose.mockImplementation((cb: () => void) => {
        callOrder.push('serverClose')
        cb()
      })
      mockTaskRegistryDestroy.mockImplementation(() => { callOrder.push('taskRegistryDestroy') })
      mockPrisma.$disconnect.mockImplementation(async () => { callOrder.push('prismaDisconnect') })

      const shutdownPromise = indexModule.shutdown()
      await vi.advanceTimersByTimeAsync(1000)
      await shutdownPromise

      expect(callOrder).toEqual([
        'stopScheduler',
        'serverClose',
        'taskRegistryDestroy',
        'prismaDisconnect',
      ])
    })

    it('prevents double-shutdown (second call is a no-op)', async () => {
      // First shutdown
      const first = indexModule.shutdown()
      await vi.advanceTimersByTimeAsync(1000)
      await first

      // Second shutdown should be a no-op
      const second = indexModule.shutdown()
      await vi.advanceTimersByTimeAsync(1000)
      await second

      expect(mockStopScheduler).toHaveBeenCalledTimes(1)
      expect(mockServerClose).toHaveBeenCalledTimes(1)
      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1)
    })

    it('sets a force-exit timeout with .unref()', async () => {
      const mockUnref = vi.fn()
      const originalSetTimeout = globalThis.setTimeout
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number) => {
        const timer = originalSetTimeout(fn as (...args: unknown[]) => void, ms)
        ;(timer as unknown as { unref: typeof mockUnref }).unref = mockUnref
        return timer
      }) as unknown as typeof setTimeout)

      const shutdownPromise = indexModule.shutdown()
      await vi.advanceTimersByTimeAsync(1000)
      await shutdownPromise

      // Find the call that sets the 10-second force-exit timeout
      const forceExitCall = setTimeoutSpy.mock.calls.find(
        ([, ms]) => ms === 10_000
      )
      expect(forceExitCall).toBeDefined()
      expect(mockUnref).toHaveBeenCalled()

      setTimeoutSpy.mockRestore()
    })

    it('waits for running tasks to drain before disconnecting prisma', async () => {
      // First call returns running tasks, second call returns empty
      mockGetProcessingStoryIds
        .mockReturnValueOnce(['story-1', 'story-2'])
        .mockReturnValueOnce(['story-1'])
        .mockReturnValueOnce([])

      const callOrder: string[] = []
      mockPrisma.$disconnect.mockImplementation(async () => { callOrder.push('prismaDisconnect') })
      mockTaskRegistryDestroy.mockImplementation(() => { callOrder.push('taskRegistryDestroy') })

      const shutdownPromise = indexModule.shutdown()

      // Advance through polling intervals (500ms each)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)
      await shutdownPromise

      // Should have polled multiple times
      expect(mockGetProcessingStoryIds).toHaveBeenCalledTimes(3)
      // Prisma should disconnect after tasks drained
      expect(callOrder).toEqual(['taskRegistryDestroy', 'prismaDisconnect'])
    })

    it('breaks out of drain loop when deadline exceeded and still runs cleanup', async () => {
      // Always return running tasks (never drains)
      mockGetProcessingStoryIds.mockReturnValue(['stuck-task'])

      const shutdownPromise = indexModule.shutdown()

      // Advance past the drain deadline (FORCE_EXIT_MS - 1000 = 9000ms)
      await vi.advanceTimersByTimeAsync(10_000)
      await shutdownPromise

      // Should still clean up even though tasks never drained
      expect(mockTaskRegistryDestroy).toHaveBeenCalledTimes(1)
      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1)
      expect(mockProcessExit).toHaveBeenCalledWith(0)
    })

    it('calls process.exit(0) on successful shutdown', async () => {
      const shutdownPromise = indexModule.shutdown()
      await vi.advanceTimersByTimeAsync(1000)
      await shutdownPromise

      expect(mockProcessExit).toHaveBeenCalledWith(0)
    })
  })

  describe('exports', () => {
    it('exports the app as default', () => {
      expect(indexModule.default).toBe(mockApp)
    })

    it('exports shutdown as a named export', () => {
      expect(typeof indexModule.shutdown).toBe('function')
    })
  })
})
