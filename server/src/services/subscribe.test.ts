import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockPrisma = {
  pendingSubscription: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
}

const mockBrevo = {
  createContact: vi.fn(),
  updateContact: vi.fn(),
  sendTransactional: vi.fn(),
  verifyEmail: vi.fn(),
  listContacts: vi.fn(),
  getContact: vi.fn(),
  deleteContact: vi.fn(),
}

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./brevo.js', () => mockBrevo)

const { subscribe, EmailValidationError, cleanupExpiredPendingSubscriptions, reconcileUnsubscribedFromBrevo, confirmSubscription } = await import('./subscribe.js')

describe('subscribe service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.pendingSubscription.findFirst.mockResolvedValue(null)
    mockPrisma.pendingSubscription.create.mockResolvedValue({ id: '1' })
    mockPrisma.pendingSubscription.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.pendingSubscription.update.mockResolvedValue({ id: '1' })
    mockBrevo.createContact.mockResolvedValue({ id: 'contact-1' })
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
    mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: true, isDisposable: false })
    mockBrevo.listContacts.mockResolvedValue({ items: [], nextCursor: null, hasMore: false, total: 0 })
    mockBrevo.updateContact.mockResolvedValue({ id: 'contact-1' })
  })

  describe('email verification', () => {
    it('calls verifyEmail before creating contact', async () => {
      const callOrder: string[] = []
      mockBrevo.verifyEmail.mockImplementation(async () => {
        callOrder.push('verify')
        return { valid: true, domainExists: true, isDisposable: false }
      })
      mockBrevo.createContact.mockImplementation(async () => {
        callOrder.push('createContact')
        return { id: 'contact-1' }
      })

      await subscribe({ email: 'test@example.com' })

      expect(callOrder).toEqual(['verify', 'createContact'])
    })

    it('throws EmailValidationError when email is invalid', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: false, domainExists: true, isDisposable: false })

      await expect(subscribe({ email: 'bad@example.com' })).rejects.toThrow(EmailValidationError)
    })

    it('throws EmailValidationError when domain does not exist', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: false, isDisposable: false })

      await expect(subscribe({ email: 'user@nodomain.fake' })).rejects.toThrow(EmailValidationError)
    })

    it('throws EmailValidationError for disposable emails', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: true, isDisposable: true })

      await expect(subscribe({ email: 'temp@mailinator.com' })).rejects.toThrow(EmailValidationError)
    })

    it('includes user-facing message in EmailValidationError', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: false, domainExists: true, isDisposable: false })

      try {
        await subscribe({ email: 'bad@example.com' })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(EmailValidationError)
        expect((err as InstanceType<typeof EmailValidationError>).message).toBeTruthy()
      }
    })

    it('skips verification gracefully if Brevo verify API fails', async () => {
      mockBrevo.verifyEmail.mockRejectedValue(new Error('Brevo API down'))

      // Should not throw — graceful degradation
      await subscribe({ email: 'test@example.com' })

      expect(mockBrevo.createContact).toHaveBeenCalled()
    })
  })

  describe('firstName parameter', () => {
    it('passes firstName to createContact data', async () => {
      await subscribe({ email: 'test@example.com', firstName: 'John' })

      expect(mockBrevo.createContact).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ NOMBRE: 'John' }),
        }),
      )
    })

    it('works without firstName', async () => {
      await subscribe({ email: 'test@example.com' })

      expect(mockBrevo.createContact).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          subscribed: false,
        }),
      )
    })

    it('personalizes confirmation email when firstName provided', async () => {
      await subscribe({ email: 'test@example.com', firstName: 'Jane' })

      const emailBody = mockBrevo.sendTransactional.mock.calls[0][0].body
      expect(emailBody).toContain('Jane')
    })

    it('does not include a name in greeting when firstName not provided', async () => {
      await subscribe({ email: 'test@example.com' })

      const emailBody = mockBrevo.sendTransactional.mock.calls[0][0].body
      expect(emailBody).not.toContain('Jane')
    })
  })

  describe('existing subscription', () => {
    it('returns early if already confirmed', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue({ confirmedAt: new Date() })

      await subscribe({ email: 'existing@example.com' })

      expect(mockBrevo.verifyEmail).not.toHaveBeenCalled()
      expect(mockBrevo.createContact).not.toHaveBeenCalled()
    })
  })

  describe('re-subscribe (unconfirmed)', () => {
    it('deletes existing unconfirmed entries before creating new one', async () => {
      mockPrisma.pendingSubscription.deleteMany.mockResolvedValue({ count: 1 })

      await subscribe({ email: 'retry@example.com' })

      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: 'retry@example.com', confirmedAt: null },
      })
      expect(mockPrisma.pendingSubscription.create).toHaveBeenCalled()
    })

    it('deletes unconfirmed entries after email verification', async () => {
      const callOrder: string[] = []
      mockBrevo.verifyEmail.mockImplementation(async () => {
        callOrder.push('verify')
        return { valid: true, domainExists: true, isDisposable: false }
      })
      mockPrisma.pendingSubscription.deleteMany.mockImplementation(async () => {
        callOrder.push('deleteMany')
        return { count: 0 }
      })

      await subscribe({ email: 'test@example.com' })

      expect(callOrder).toEqual(['verify', 'deleteMany'])
    })

    it('does not delete confirmed entries', async () => {
      await subscribe({ email: 'test@example.com' })

      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ confirmedAt: null }),
      })
    })

    it('skips re-subscribe cleanup when already confirmed', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue({ confirmedAt: new Date() })

      await subscribe({ email: 'confirmed@example.com' })

      expect(mockPrisma.pendingSubscription.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe('cleanupExpiredPendingSubscriptions (retention — Ley 21.719)', () => {
    const DIA = 24 * 60 * 60 * 1000
    const vencida = (id: string, email: string, diasVencida = 1) => ({
      id,
      email,
      expiresAt: new Date(Date.now() - diasVencida * DIA),
    })
    const http = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

    /** La primera búsqueda trae las vencidas; las siguientes, las filas de un correo. */
    function filas(vencidas: ReturnType<typeof vencida>[], porCorreo: Record<string, { id: string; email: string }[]> = {}) {
      mockPrisma.pendingSubscription.findMany.mockImplementation(async ({ where }: any) => {
        if (where.confirmedAt === null) return vencidas
        const correo = where.email.equals as string
        return porCorreo[correo] ?? vencidas.filter((v) => v.email.toLowerCase() === correo)
      })
      mockPrisma.pendingSubscription.deleteMany.mockImplementation(async ({ where }: any) => ({ count: where.id.in.length }))
    }

    beforeEach(() => {
      mockBrevo.getContact.mockResolvedValue({ id: '77', listIds: [], subscribed: true })
      mockBrevo.deleteContact.mockResolvedValue(undefined)
    })

    it('busca solo las no confirmadas cuyo token venció', async () => {
      filas([])

      expect(await cleanupExpiredPendingSubscriptions()).toBe(0)
      expect(mockPrisma.pendingSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { confirmedAt: null, expiresAt: { lt: expect.any(Date) } } }),
      )
      expect(mockPrisma.pendingSubscription.deleteMany).not.toHaveBeenCalled()
    })

    it('borra la fila Y el contacto que el alta dejó en Brevo', async () => {
      filas([vencida('p1', 'Ana@x.cl')])

      expect(await cleanupExpiredPendingSubscriptions()).toBe(1)
      expect(mockBrevo.getContact).toHaveBeenCalledWith('ana@x.cl')
      expect(mockBrevo.deleteContact).toHaveBeenCalledWith('77')
      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] } } })
    })

    it('NO toca Brevo si el correo tiene otra fila (una suscripción confirmada comparte el contacto)', async () => {
      filas([vencida('p1', 'ana@x.cl')], { 'ana@x.cl': [{ id: 'p1', email: 'ana@x.cl' }, { id: 'c1', email: 'ANA@x.cl' }] })

      expect(await cleanupExpiredPendingSubscriptions()).toBe(1)
      expect(mockBrevo.getContact).not.toHaveBeenCalled()
      expect(mockBrevo.deleteContact, 'borró el contacto de un suscriptor activo').not.toHaveBeenCalled()
    })

    it('una fila de OTRO correo que ILIKE trae por comodín no cuenta como hermana', async () => {
      filas([vencida('p1', 'a_b@x.cl')], { 'a_b@x.cl': [{ id: 'p1', email: 'a_b@x.cl' }, { id: 'c9', email: 'axb@x.cl' }] })

      await cleanupExpiredPendingSubscriptions()

      expect(mockBrevo.deleteContact).toHaveBeenCalledWith('77')
    })

    it('NO borra un contacto que está en alguna lista', async () => {
      filas([vencida('p1', 'ana@x.cl')])
      mockBrevo.getContact.mockResolvedValue({ id: '77', listIds: [2], subscribed: true })

      expect(await cleanupExpiredPendingSubscriptions()).toBe(1)
      expect(mockBrevo.deleteContact).not.toHaveBeenCalled()
    })

    it('NO borra un contacto en la lista de supresión: esa baja es memoria que sirve', async () => {
      filas([vencida('p1', 'ana@x.cl')])
      mockBrevo.getContact.mockResolvedValue({ id: '77', listIds: [], subscribed: false })

      expect(await cleanupExpiredPendingSubscriptions()).toBe(1)
      expect(mockBrevo.deleteContact).not.toHaveBeenCalled()
    })

    it('si Brevo no tiene el contacto (404), la fila se borra igual', async () => {
      filas([vencida('p1', 'ana@x.cl')])
      mockBrevo.getContact.mockRejectedValue(http(404))

      expect(await cleanupExpiredPendingSubscriptions()).toBe(1)
    })

    it('si Brevo falla, la fila se queda para reintentar mañana', async () => {
      filas([vencida('p1', 'ana@x.cl'), vencida('p2', 'luis@x.cl')])
      mockBrevo.getContact.mockImplementation(async (correo: string) => {
        if (correo === 'ana@x.cl') throw http(503)
        return { id: '88', listIds: [], subscribed: true }
      })

      expect(await cleanupExpiredPendingSubscriptions()).toBe(1)
      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p2'] } } })
    })

    it('pero pasados 30 días de vencida se borra aunque Brevo siga caído', async () => {
      filas([vencida('p1', 'ana@x.cl', 31)])
      mockBrevo.getContact.mockResolvedValue({ id: '77', listIds: [], subscribed: true })
      mockBrevo.deleteContact.mockRejectedValue(http(503))

      expect(await cleanupExpiredPendingSubscriptions()).toBe(1)
    })

    it('consulta Brevo una vez por correo, no una por fila', async () => {
      filas([vencida('p1', 'ana@x.cl'), vencida('p2', 'ANA@x.cl')])

      expect(await cleanupExpiredPendingSubscriptions()).toBe(2)
      expect(mockBrevo.getContact).toHaveBeenCalledTimes(1)
    })
  })
  describe('reconcileUnsubscribedFromBrevo (la baja del boletin)', () => {
    /**
     * La Politica promete borrar la fila «tras la baja», pero el enlace del pie
     * de la campaña es el merge tag de Brevo: da de baja alla y no toca esta
     * base. Esto lo reconcilia. Lo que se prueba aqui es sobre todo CUANDO NO
     * debe borrar: un borrado de mas aqui elimina suscriptores vivos.
     */

    const contacto = (email: string, subscribed: boolean) => ({
      id: email, email, subscribed, data: {}, createdAt: '', updatedAt: '',
    })

    it('borra las filas confirmadas de quienes se dieron de baja en Brevo', async () => {
      mockBrevo.listContacts.mockResolvedValue({
        items: [contacto('baja@example.com', false), contacto('activo@example.com', true)],
        nextCursor: null, hasMore: false, total: 2,
      })
      mockPrisma.pendingSubscription.deleteMany.mockResolvedValue({ count: 1 })

      const r = await reconcileUnsubscribedFromBrevo()

      expect(r.borrados).toBe(1)
      expect(r.omitidoPorSalvaguarda).toBe(false)
      // Solo el dado de baja, y solo filas CONFIRMADAS: las no confirmadas son
      // asunto del otro barrido y borrarlas aqui pisaria un opt-in en curso.
      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: { in: ['baja@example.com'] }, confirmedAt: { not: null } },
      })
    })

    it('normaliza el correo a minusculas antes de comparar', async () => {
      mockBrevo.listContacts.mockResolvedValue({
        items: [contacto('Baja@Example.COM', false)],
        nextCursor: null, hasMore: false, total: 1,
      })
      await reconcileUnsubscribedFromBrevo()
      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: { in: ['baja@example.com'] }, confirmedAt: { not: null } },
      })
    })

    it('recorre todas las paginas antes de borrar', async () => {
      mockBrevo.listContacts
        .mockResolvedValueOnce({ items: [contacto('uno@example.com', false)], nextCursor: '50', hasMore: true, total: 2 })
        .mockResolvedValueOnce({ items: [contacto('dos@example.com', false)], nextCursor: null, hasMore: false, total: 2 })
      mockPrisma.pendingSubscription.deleteMany.mockResolvedValue({ count: 2 })

      const r = await reconcileUnsubscribedFromBrevo()

      expect(mockBrevo.listContacts).toHaveBeenCalledTimes(2)
      expect(mockBrevo.listContacts).toHaveBeenNthCalledWith(2, '50')
      expect(r.revisados).toBe(2)
      expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({
        where: { email: { in: ['uno@example.com', 'dos@example.com'] }, confirmedAt: { not: null } },
      })
    })

    it('NO borra nada si el listado falla a mitad de camino', async () => {
      // Media lista leida es peor que ninguna: los contactos no leidos se verian
      // como «no dados de baja», pero los leidos si borrarian. Un fallo de red
      // no puede traducirse en un borrado parcial.
      mockBrevo.listContacts
        .mockResolvedValueOnce({ items: [contacto('uno@example.com', false)], nextCursor: '50', hasMore: true, total: 2 })
        .mockRejectedValueOnce(new Error('brevo caido'))

      const r = await reconcileUnsubscribedFromBrevo()

      expect(r.borrados).toBe(0)
      expect(r.omitidoPorSalvaguarda).toBe(true)
      expect(mockPrisma.pendingSubscription.deleteMany).not.toHaveBeenCalled()
    })

    it('NO borra nada si el recorrido se corta por el tope de paginas', async () => {
      // Un `hasMore` que nunca baja dejaria el recorrido incompleto; tampoco ahi
      // se borra.
      mockBrevo.listContacts.mockResolvedValue({
        items: [contacto('uno@example.com', false)], nextCursor: '50', hasMore: true, total: 99999,
      })

      const r = await reconcileUnsubscribedFromBrevo()

      expect(r.borrados).toBe(0)
      expect(r.omitidoPorSalvaguarda).toBe(true)
      expect(mockPrisma.pendingSubscription.deleteMany).not.toHaveBeenCalled()
    })

    it('no toca la base cuando nadie se dio de baja', async () => {
      mockBrevo.listContacts.mockResolvedValue({
        items: [contacto('activo@example.com', true)], nextCursor: null, hasMore: false, total: 1,
      })

      const r = await reconcileUnsubscribedFromBrevo()

      expect(r.borrados).toBe(0)
      expect(r.omitidoPorSalvaguarda).toBe(false)
      expect(mockPrisma.pendingSubscription.deleteMany).not.toHaveBeenCalled()
    })
  })
  describe('confirmSubscription y la re-alta despues de una baja', () => {
    /**
     * Quien vuelve tras darse de baja YA tiene contacto en Brevo, asi que el
     * createContact del alta falla por duplicado y deja plunkContactId en null.
     * Antes eso significaba confirmar la re-alta y no volver a recibir nada,
     * con el job de reconciliacion borrandole la fila al dia siguiente: un
     * ciclo silencioso. Ahora se usa el correo como identificador.
     */
    const pendiente = (plunkContactId: string | null) => ({
      id: 'p1', email: 'vuelve@example.com', token: 'tok', plunkContactId,
      confirmedAt: null, expiresAt: new Date(Date.now() + 3600_000),
    })

    it('re-suscribe usando el correo cuando no hay id de contacto', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue(pendiente(null))

      await confirmSubscription('tok', 'vuelve@example.com')

      expect(mockBrevo.updateContact).toHaveBeenCalledWith('vuelve@example.com', { subscribed: true })
    })

    it('usa el id cuando si existe', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue(pendiente('contact-9'))

      await confirmSubscription('tok', 'vuelve@example.com')

      expect(mockBrevo.updateContact).toHaveBeenCalledWith('contact-9', { subscribed: true })
    })

    it('si el contacto ya no existe (404), lo crea dentro de la lista en vez de dejarla confirmada sin boletín', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue(pendiente('77'))
      mockPrisma.pendingSubscription.findUnique.mockResolvedValue({ id: 'p1' })
      mockBrevo.updateContact.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { response: { status: 404 } }))

      await confirmSubscription('tok', 'vuelve@example.com')

      expect(mockBrevo.createContact, 'confirmó sin contacto en la lista').toHaveBeenCalledWith(
        expect.objectContaining({ email: 'vuelve@example.com', subscribed: true }),
      )
      expect(mockPrisma.pendingSubscription.update).toHaveBeenCalled()
    })

    it('NO recrea el contacto si la fila se borró mientras confirmaba (un borrado en curso)', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue(pendiente('77'))
      mockPrisma.pendingSubscription.findUnique.mockResolvedValue(null)
      mockBrevo.updateContact.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { response: { status: 404 } }))

      await expect(confirmSubscription('tok', 'vuelve@example.com')).rejects.toThrow('Invalid confirmation link')
      expect(mockBrevo.createContact, 'volvió a meter en la lista a quien pedía salir').not.toHaveBeenCalled()
      expect(mockPrisma.pendingSubscription.update).not.toHaveBeenCalled()
    })

    it('si la fila desaparece al marcarla (un borrado en curso), deshace el contacto que recreó', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue(pendiente('77'))
      mockPrisma.pendingSubscription.findUnique.mockResolvedValue({ id: 'p1' })
      mockBrevo.updateContact.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { response: { status: 404 } }))
      mockPrisma.pendingSubscription.update.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'P2025' }))
      mockBrevo.deleteContact.mockResolvedValue(undefined)

      await expect(confirmSubscription('tok', 'vuelve@example.com')).rejects.toThrow('Invalid confirmation link')
      expect(mockBrevo.createContact).toHaveBeenCalled()
      expect(mockBrevo.deleteContact, 'quedó en la lista quien pidió salir, sin fila para encontrarlo').toHaveBeenCalledWith(
        'vuelve@example.com',
      )
    })

    it('confirma igual si el proveedor falla: la baja no puede dejar a nadie en el limbo', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue(pendiente(null))
      mockBrevo.updateContact.mockRejectedValue(new Error('brevo caido'))

      await confirmSubscription('tok', 'vuelve@example.com')

      expect(mockPrisma.pendingSubscription.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { confirmedAt: expect.any(Date) },
      })
    })
  })
})
