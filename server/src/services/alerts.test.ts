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
const { unsubscribeByToken, sendDailyAlerts, cleanupExpiredAlertSubscriptions, subscribeToAlerts, confirmAlert } = alertsModule

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

describe('cambiar los temas de una suscripcion confirmada exige doble confirmacion', () => {
  // El formulario es publico y el correo es el unico dato que pide: quien lo
  // conozca podia reescribir los temas de un suscriptor sin ninguna prueba de
  // que el correo fuera suyo. Ahora el cambio solo se aplica cuando el titular
  // hace clic en el enlace que llega a SU bandeja.
  const CONFIRMADA = {
    id: 'sub-confirmada',
    email: 'lectora@example.com',
    topics: ['litio'],
    token: 'token-permanente-de-baja',
    confirmedAt: new Date('2026-06-01'),
    active: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
    mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.alertSubscription.create.mockResolvedValue({ id: 'sub-pendiente' })
    mockPrisma.alertSubscription.update.mockResolvedValue({})
    mockPrisma.alertSubscription.updateMany.mockResolvedValue({ count: 0 })
  })

  describe('pedir el cambio (POST /subscribe)', () => {
    it('NO toca los temas de la suscripcion confirmada', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue(CONFIRMADA)

      await subscribeToAlerts('lectora@example.com', ['mineria', 'agua'])

      expect(mockPrisma.alertSubscription.update).not.toHaveBeenCalled()
      expect(mockPrisma.alertSubscription.updateMany).not.toHaveBeenCalled()
    })

    it('guarda el pedido como una fila PENDIENTE con token nuevo y manda el correo de confirmacion al titular', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue(CONFIRMADA)

      await subscribeToAlerts('lectora@example.com', ['mineria', 'agua'])

      expect(mockPrisma.alertSubscription.create).toHaveBeenCalledTimes(1)
      const { data } = mockPrisma.alertSubscription.create.mock.calls[0][0]
      expect(data.email).toBe('lectora@example.com')
      expect(data.topics).toEqual(['mineria', 'agua'])
      expect(data.token).toBeTruthy()
      expect(data.token).not.toBe(CONFIRMADA.token) // el token de baja permanente no se reutiliza
      expect(data).not.toHaveProperty('confirmedAt') // nace sin confirmar

      expect(mockBrevo.sendTransactional).toHaveBeenCalledTimes(1)
      const { to, subject, body } = mockBrevo.sendTransactional.mock.calls[0][0]
      expect(to).toBe('lectora@example.com')
      expect(subject).toMatch(/cambio/i)
      expect(body).toContain(`/api/alerts/confirm?token=${data.token}`)
      expect(body).toContain('mineria')
      // Le dice que si no fue ella, nada cambia.
      expect(body).toMatch(/ignora este correo/i)
    })

    it('solo limpia pedidos viejos SIN confirmar: nunca la suscripcion confirmada', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue(CONFIRMADA)

      await subscribeToAlerts('lectora@example.com', ['mineria'])

      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: 'lectora@example.com', confirmedAt: null },
      })
    })

    it('si los temas pedidos son los que ya tiene (sin importar orden ni mayusculas), no hace nada ni manda correo', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue({ ...CONFIRMADA, topics: ['litio', 'Agua'] })

      await subscribeToAlerts('lectora@example.com', ['agua', ' LITIO '])

      expect(mockPrisma.alertSubscription.create).not.toHaveBeenCalled()
      expect(mockPrisma.alertSubscription.deleteMany).not.toHaveBeenCalled()
      expect(mockBrevo.sendTransactional).not.toHaveBeenCalled()
    })

    it('los temas del pedido van escapados en el correo, tambien en el de cambio', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue(CONFIRMADA)

      await subscribeToAlerts('lectora@example.com', ['<a href="https://evil.example">x</a>'])

      const { body } = mockBrevo.sendTransactional.mock.calls[0][0]
      expect(body).not.toContain('<a href="https://evil.example')
      expect(body).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;')
    })

    it('una direccion nueva sigue el camino de siempre: fila pendiente y correo de alta, no de cambio', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue(null)

      await subscribeToAlerts('nueva@example.com', ['litio'])

      expect(mockPrisma.alertSubscription.create).toHaveBeenCalledTimes(1)
      const { subject } = mockBrevo.sendTransactional.mock.calls[0][0]
      expect(subject).not.toMatch(/cambio/i)
    })
  })

  describe('confirmar el cambio (GET /confirm)', () => {
    const PENDIENTE = {
      id: 'sub-pendiente',
      email: 'lectora@example.com',
      topics: ['mineria', 'agua'],
      token: 'token-del-cambio',
      confirmedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      active: true,
    }

    it('aplica los temas del pedido a la suscripcion confirmada, conserva su token de baja y borra el pedido', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue(PENDIENTE)
      mockPrisma.alertSubscription.updateMany.mockResolvedValue({ count: 1 })

      const resultado = await confirmAlert('token-del-cambio', 'lectora@example.com')

      expect(resultado).toBe('changed')
      expect(mockPrisma.alertSubscription.updateMany).toHaveBeenCalledWith({
        where: { email: 'lectora@example.com', confirmedAt: { not: null }, active: true, id: { not: 'sub-pendiente' } },
        data: { topics: ['mineria', 'agua'] },
      })
      // La fila pendiente no se convierte en una segunda suscripcion confirmada...
      expect(mockPrisma.alertSubscription.update).not.toHaveBeenCalled()
      // ...se borra, y la confirmada con su token de baja de siempre queda.
      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 'sub-pendiente' } })
    })

    it('un pedido vencido no cambia nada', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue({ ...PENDIENTE, expiresAt: new Date(Date.now() - 1000) })

      await expect(confirmAlert('token-del-cambio', 'lectora@example.com')).rejects.toThrow(/expired/i)
      expect(mockPrisma.alertSubscription.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.alertSubscription.update).not.toHaveBeenCalled()
    })

    it('un token o un correo que no coinciden no cambian nada', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue(null)

      await expect(confirmAlert('otro-token', 'lectora@example.com')).rejects.toThrow(/invalid/i)
      expect(mockPrisma.alertSubscription.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.alertSubscription.update).not.toHaveBeenCalled()
    })

    it('confirmar el alta de una direccion nueva sigue igual: marca la fila como confirmada', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue({ ...PENDIENTE, email: 'nueva@example.com' })
      mockPrisma.alertSubscription.updateMany.mockResolvedValue({ count: 0 }) // no hay otra confirmada

      const resultado = await confirmAlert('token-del-cambio', 'nueva@example.com')

      expect(resultado).toBe('confirmed')
      expect(mockPrisma.alertSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-pendiente' },
        data: { confirmedAt: expect.any(Date) },
      })
      expect(mockPrisma.alertSubscription.deleteMany).not.toHaveBeenCalled()
    })

    it('volver a abrir un enlace de alta ya confirmado es inocuo', async () => {
      mockPrisma.alertSubscription.findFirst.mockResolvedValue({ ...PENDIENTE, confirmedAt: new Date() })

      const resultado = await confirmAlert('token-del-cambio', 'lectora@example.com')

      expect(resultado).toBe('already')
      expect(mockPrisma.alertSubscription.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.alertSubscription.update).not.toHaveBeenCalled()
    })
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
