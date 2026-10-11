import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies (same pattern as subscribe.test.ts)
const mockPrisma = {
  alertSubscription: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  story: {
    findMany: vi.fn(),
  },
}

const mockBrevo = {
  sendTransactional: vi.fn(),
}

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./brevo.js', () => mockBrevo)

const alertsModule = await import('./alerts.js')
const { unsubscribeByToken, sendDailyAlerts, cleanupExpiredAlertSubscriptions, subscribeToAlerts } = alertsModule

describe('alerts unsubscribe (B1 — hard delete, Ley 21.719)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 1 })
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
  })

  describe('unsubscribeByToken (current path)', () => {
    it('DELETES every subscription row for the token owner — no soft-delete', async () => {
      mockPrisma.alertSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        email: 'lectora@example.com',
        token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      })

      const result = await unsubscribeByToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

      expect(result).toBe(true)
      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: 'lectora@example.com' },
      })
      // REGRESSION GUARD: the old behavior flagged rows inactive instead of
      // deleting them — the policy promises removal.
      expect(mockPrisma.alertSubscription.updateMany).not.toHaveBeenCalled()
    })

    it('is idempotent: an unknown or already-used token is a no-op', async () => {
      mockPrisma.alertSubscription.findUnique.mockResolvedValue(null)

      const result = await unsubscribeByToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

      expect(result).toBe(false)
      expect(mockPrisma.alertSubscription.deleteMany).not.toHaveBeenCalled()
    })

    it('ignores token expiry — unsubscribe links must work forever', async () => {
      // expiresAt is in the past: confirmation would reject it, unsubscribe must not.
      mockPrisma.alertSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        email: 'lectora@example.com',
        token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        expiresAt: new Date('2020-01-01'),
      })

      const result = await unsubscribeByToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

      expect(result).toBe(true)
      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalled()
    })
  })

  describe('la baja por correo suelto ya no existe', () => {
    it('el servicio NO exporta ninguna funcion que borre por correo', () => {
      // `unsubscribeFromAlerts(email)` se borro el 8-sep-2026: bastaba conocer
      // la direccion de alguien para desactivar sus alertas, y el endpoint que
      // la llamaba no tenia limitador. Este test existe para que no vuelva por
      // conveniencia — la prueba de posesion es el token, que llega al correo
      // de su titular.
      expect(alertsModule).not.toHaveProperty('unsubscribeFromAlerts')
      const exportados = Object.keys(alertsModule)
      const sospechosos = exportados.filter((n) => /^unsubscribe/i.test(n) && n !== 'unsubscribeByToken')
      expect(sospechosos, `bajas sin prueba de posesion: ${sospechosos.join(', ')}`).toEqual([])
    })
  })
})

describe('alert emails (token links + real publisher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
  })

  it('embeds the token (never the email) in the unsubscribe URL and shows the real publisher', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Noticia sobre litio en territorio mapuche',
        slug: 'noticia-litio',
        summary: 'El litio y la consulta previa…',
        imageUrl: null,
        sourceUrl: 'https://www.elpais.com/chile/2026/litio',
        datePublished: new Date('2026-06-09'),
        issue: { name: 'Chile Intercultural', slug: 'chile' },
        feed: { title: 'Google News', displayTitle: null },
      },
    ])
    mockPrisma.alertSubscription.findMany.mockResolvedValue([
      {
        email: 'lectora@example.com',
        token: 'tok-uuid-1234',
        topics: ['litio'],
        active: true,
        confirmedAt: new Date(),
      },
    ])

    await sendDailyAlerts()

    expect(mockBrevo.sendTransactional).toHaveBeenCalledTimes(1)
    const { body, to } = mockBrevo.sendTransactional.mock.calls[0][0]
    expect(to).toBe('lectora@example.com')
    expect(body).toContain('unsubscribe_token=tok-uuid-1234')
    // The reader's email must not appear in any URL inside the email body.
    expect(body).not.toContain('unsubscribe=lectora')
    // Real outlet derived from sourceUrl, not the discovery feed name.
    expect(body).toContain('El País')
  })
})

describe('correos de alertas: lo que no es nuestro no entra como marcado', () => {
  // Un tema es texto que escribe quien llama al formulario publico, y el titulo
  // de una nota sale de la pagina de un tercero. Ninguno puede llegar al correo
  // como HTML: sale desde el remitente de la Fundacion.
  const ATAQUE = '</li></ul><p><a href="https://evil.example/entra">Verifica tu cuenta</a></p><img src="https://evil.example/p.gif"><ul><li>'

  beforeEach(() => {
    vi.clearAllMocks()
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
  })

  it('la confirmacion no inyecta el marcado de un tema', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue(null)
    mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.alertSubscription.create.mockResolvedValue({ id: 'sub-1' })

    await subscribeToAlerts('victima@example.com', [ATAQUE, 'litio'])

    expect(mockBrevo.sendTransactional).toHaveBeenCalledTimes(1)
    const { body, to } = mockBrevo.sendTransactional.mock.calls[0][0]
    expect(to).toBe('victima@example.com')
    expect(body).not.toContain('<a href="https://evil.example')
    expect(body).not.toContain('<img src="https://evil.example')
    expect(body).toContain('&lt;a href=&quot;https://evil.example/entra&quot;&gt;')
    // El tema legitimo y el enlace de confirmacion siguen intactos.
    expect(body).toContain('litio')
    expect(body).toContain('/api/alerts/confirm?token=')
  })

  it('la alerta diaria no inyecta el marcado de los temas ni del titulo de una nota', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      {
        id: 's1',
        title: `Litio <script>alert(1)</script> ${ATAQUE}`,
        slug: 'noticia-litio',
        summary: 'litio',
        imageUrl: null,
        sourceUrl: 'https://www.elpais.com/chile/2026/litio',
        datePublished: new Date('2026-06-09'),
        issue: null,
        feed: { title: 'Google News', displayTitle: null },
      },
    ])
    mockPrisma.alertSubscription.findMany.mockResolvedValue([
      { email: 'lectora@example.com', token: 'tok-uuid-1234', topics: ['litio', ATAQUE], active: true, confirmedAt: new Date() },
    ])

    await sendDailyAlerts()

    expect(mockBrevo.sendTransactional).toHaveBeenCalledTimes(1)
    const { body } = mockBrevo.sendTransactional.mock.calls[0][0]
    expect(body).not.toContain('<a href="https://evil.example')
    expect(body).not.toContain('<img src="https://evil.example')
    expect(body).not.toContain('<script>')
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(body).toContain('unsubscribe_token=tok-uuid-1234')
  })
})

describe('cleanupExpiredAlertSubscriptions (retention — Ley 21.719)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes only unconfirmed alert subscriptions whose token expired', async () => {
    mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 2 })

    const count = await cleanupExpiredAlertSubscriptions()

    expect(count).toBe(2)
    expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalledWith({
      where: { confirmedAt: null, expiresAt: { lt: expect.any(Date) } },
    })
  })
})
