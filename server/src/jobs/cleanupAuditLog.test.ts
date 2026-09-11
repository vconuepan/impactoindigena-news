import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({ $executeRaw: vi.fn() }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../config.js', () => ({ config: { audit: { retentionDays: 365 } } }))

const { runCleanupAuditLog } = await import('./cleanupAuditLog.js')

describe('runCleanupAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$executeRaw.mockResolvedValue(0)
  })

  it('borra las entradas mas antiguas que el plazo de conservacion', async () => {
    await runCleanupAuditLog()
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1)

    const [strings, cutoff] = mockPrisma.$executeRaw.mock.calls[0]
    expect(strings.join('?')).toContain('audit_log')
    expect(cutoff).toBeInstanceOf(Date)

    // 365 dias atras, normalizado a medianoche UTC, igual que cleanup_analytics.
    const esperado = new Date()
    esperado.setUTCDate(esperado.getUTCDate() - 365)
    esperado.setUTCHours(0, 0, 0, 0)
    expect((cutoff as Date).toISOString()).toBe(esperado.toISOString())
  })

  it('acota el borrado por fecha y no vacia la tabla', async () => {
    // Un `DELETE FROM audit_log` sin `WHERE` destruiria el registro completo,
    // que es justo la evidencia que la Politica promete tener ante un incidente.
    await runCleanupAuditLog()
    const [strings] = mockPrisma.$executeRaw.mock.calls[0]
    const sql = strings.join('?')
    expect(sql).toMatch(/WHERE\s+created_at\s*</i)
  })
})
