import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Base falsa en memoria. La búsqueda imita lo que hace PostgreSQL con
 * `mode: 'insensitive'` (ILIKE): sin mayúsculas y con `_` y `%` como
 * comodines. Así la prueba ve el caso que importa: buscar «a_b@x.cl» trae
 * también a «axb@x.cl», que es otra persona.
 */
type Fila = { id: string; email: string | null; [k: string]: unknown }
const tablas: Record<string, Fila[]> = {}

function ilike(valor: string | null, patron: string): boolean {
  if (valor === null) return false
  const re = patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.').replace(/%/g, '.*')
  return new RegExp(`^${re}$`, 'i').test(valor)
}

function modelo(nombre: string) {
  return {
    findMany: vi.fn(async ({ where }: { where: { email: { equals: string } } }) =>
      tablas[nombre].filter((f) => ilike(f.email, where.email.equals)),
    ),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => tablas[nombre].find((f) => f.id === where.id) ?? null),
    deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
      const antes = tablas[nombre].length
      tablas[nombre] = tablas[nombre].filter((f) => !where.id.in.includes(f.id))
      return { count: antes - tablas[nombre].length }
    }),
  }
}

const mockPrisma = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof modelo>>)
const mockBrevo = vi.hoisted(() => ({ deleteContact: vi.fn(), getContact: vi.fn() }))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./brevo.js', () => mockBrevo)

const { suprimirPorCorreo, borrarDelBoletin, vistaPreviaSupresion, BrevoNoRespondeError, SupresionPropiaError } =
  await import('./supresion.js')

const http = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

function sembrar() {
  tablas.pendingSubscription = [
    { id: 's1', email: 'Ana@X.cl', plunkContactId: '4242', confirmedAt: new Date() },
    { id: 's2', email: 'ana@x.cl', plunkContactId: null, confirmedAt: null },
    { id: 's3', email: 'axb@x.cl', plunkContactId: '9999', confirmedAt: new Date() },
  ]
  tablas.user = [
    { id: 'u1', email: 'ana@x.cl' },
    { id: 'u2', email: 'otra@x.cl' },
  ]
  tablas.alertSubscription = [
    { id: 'a1', email: 'ANA@x.cl' },
    { id: 'a2', email: 'otra@x.cl' },
  ]
  tablas.magicLink = [{ id: 'm1', email: 'ana@x.cl' }]
  tablas.feedback = [
    { id: 'f1', email: 'ana@x.cl' },
    { id: 'f2', email: null },
  ]
}

const ids = (tabla: string) => tablas[tabla].map((f) => f.id)

describe('supresión por correo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const nombre of ['pendingSubscription', 'user', 'alertSubscription', 'magicLink', 'feedback']) {
      mockPrisma[nombre] = modelo(nombre)
    }
    sembrar()
    mockBrevo.deleteContact.mockResolvedValue(undefined)
    mockBrevo.getContact.mockResolvedValue({ id: '4242', listIds: [2], subscribed: true })
  })

  describe('suprimirPorCorreo', () => {
    it('borra todo lo del correo en las cinco tablas, sin importar mayúsculas', async () => {
      const r = await suprimirPorCorreo({ correo: '  ANA@x.cl ' })

      expect(r).toEqual({ cuentas: 1, suscripciones: 2, alertas: 1, enlaces: 1, comentarios: 1, brevo: 'borrado' })
      expect(ids('pendingSubscription')).toEqual(['s3'])
      expect(ids('user')).toEqual(['u2'])
      expect(ids('alertSubscription')).toEqual(['a2'])
      expect(ids('magicLink')).toEqual([])
      expect(ids('feedback')).toEqual(['f2'])
    })

    it('un `_` en el correo no arrastra a otra persona (ILIKE lo lee como comodín)', async () => {
      tablas.pendingSubscription.push({ id: 's4', email: 'a_b@x.cl', plunkContactId: null, confirmedAt: null })

      const r = await suprimirPorCorreo({ correo: 'a_b@x.cl' })

      expect(r.suscripciones).toBe(1)
      expect(ids('pendingSubscription'), 'borró la suscripción de axb@x.cl').toContain('s3')
      expect(mockBrevo.deleteContact, 'borró en Brevo el contacto de otra persona').not.toHaveBeenCalledWith('9999')
    })

    it('borra el contacto en Brevo por cada id y por el correo, ANTES de tocar la base', async () => {
      await suprimirPorCorreo({ correo: 'ana@x.cl' })

      // Los dos primeros borrados (id y correo) van antes que la base; el
      // tercero es el barrido final, después.
      expect(mockBrevo.deleteContact.mock.calls.map((c) => c[0])).toEqual(['4242', 'ana@x.cl', 'ana@x.cl'])
      const [id, correo] = mockBrevo.deleteContact.mock.invocationCallOrder
      const primeraLocal = mockPrisma.pendingSubscription.deleteMany.mock.invocationCallOrder[0]
      expect(Math.max(id, correo)).toBeLessThan(primeraLocal)
    })

    it('vuelve a borrar en Brevo DESPUÉS de las filas: una confirmación simultánea pudo recrear el contacto', async () => {
      await suprimirPorCorreo({ correo: 'ana@x.cl' })

      const ultimaBrevo = Math.max(...mockBrevo.deleteContact.mock.invocationCallOrder)
      const local = mockPrisma.pendingSubscription.deleteMany.mock.invocationCallOrder[0]
      expect(ultimaBrevo, 'no hubo barrido en Brevo después del borrado local').toBeGreaterThan(local)
    })

    it('el barrido final que falla no deshace la supresión: las filas ya se fueron', async () => {
      mockBrevo.deleteContact
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(http(503))

      const r = await suprimirPorCorreo({ correo: 'ana@x.cl' })

      expect(r.brevo).toBe('borrado')
      expect(ids('user')).toEqual(['u2'])
    })

    it('un 404 de Brevo es «no estaba», no un fallo', async () => {
      mockBrevo.deleteContact.mockRejectedValue(http(404))

      const r = await suprimirPorCorreo({ correo: 'ana@x.cl' })

      expect(r.brevo).toBe('no-estaba')
      expect(ids('user')).toEqual(['u2'])
    })

    it('un borrado a medias en Brevo (el id sí, el correo no) también detiene todo', async () => {
      mockBrevo.deleteContact.mockResolvedValueOnce(undefined).mockRejectedValueOnce(http(503))

      await expect(suprimirPorCorreo({ correo: 'ana@x.cl' })).rejects.toBeInstanceOf(BrevoNoRespondeError)
      expect(ids('pendingSubscription'), 'se borraron filas con Brevo a medias').toEqual(['s1', 's2', 's3'])
    })

    it('una caída de Brevo no borra NADA local: la persona seguiría en la lista sin registro para reintentar', async () => {
      mockBrevo.deleteContact.mockRejectedValue(http(503))

      await expect(suprimirPorCorreo({ correo: 'ana@x.cl' })).rejects.toBeInstanceOf(
        BrevoNoRespondeError,
      )
      expect(ids('pendingSubscription')).toEqual(['s1', 's2', 's3'])
      expect(ids('user')).toEqual(['u1', 'u2'])
      expect(ids('alertSubscription')).toEqual(['a1', 'a2'])
    })

    it('no deja que quien opera se suprima a sí mismo, y no toca nada', async () => {
      await expect(
        suprimirPorCorreo({ correo: 'ANA@x.cl', protegerUserId: 'u1' }),
      ).rejects.toBeInstanceOf(SupresionPropiaError)
      expect(mockBrevo.deleteContact).not.toHaveBeenCalled()
      expect(ids('user')).toEqual(['u1', 'u2'])
    })

    it('con `userId`, la cuenta va por id y los datos por el correo ACTUAL: el del token puede ser ya de otra persona', async () => {
      // A tenía ana@x.cl en su token; un admin le cambió el correo a nueva@x.cl,
      // y ana@x.cl es ahora la cuenta uB, de otra persona.
      tablas.user = [
        { id: 'u1', email: 'nueva@x.cl' },
        { id: 'uB', email: 'ana@x.cl' },
      ]
      tablas.alertSubscription.push({ id: 'a3', email: 'nueva@x.cl' })

      const r = await suprimirPorCorreo({ correo: 'ana@x.cl', userId: 'u1' })

      expect(r.cuentas).toBe(1)
      expect(ids('user'), 'borró la cuenta de otra persona por el correo viejo del token').toEqual(['uB'])
      expect(ids('alertSubscription'), 'borró las alertas de la otra persona').toEqual(['a1', 'a2'])
      expect(ids('pendingSubscription')).toEqual(['s1', 's2', 's3'])
      expect(mockBrevo.deleteContact).toHaveBeenCalledWith('nueva@x.cl')
      expect(mockBrevo.deleteContact).not.toHaveBeenCalledWith('ana@x.cl')
    })

    it('con `userId` de una cuenta que ya no existe, NO borra nada por el correo: vendría de un token huérfano', async () => {
      const r = await suprimirPorCorreo({ correo: 'ana@x.cl', userId: 'ya-no-existe' })

      expect(r).toEqual({ cuentas: 0, suscripciones: 0, alertas: 0, enlaces: 0, comentarios: 0, brevo: 'no-estaba' })
      expect(ids('pendingSubscription'), 'borró el boletín del dueño actual del correo').toEqual(['s1', 's2', 's3'])
      expect(ids('alertSubscription')).toEqual(['a1', 'a2'])
      expect(mockBrevo.deleteContact).not.toHaveBeenCalled()
    })

    it('un correo sin nada guardado no falla y no borra nada', async () => {
      mockBrevo.deleteContact.mockRejectedValue(http(404))

      const r = await suprimirPorCorreo({ correo: 'nadie@x.cl' })

      expect(r).toEqual({ cuentas: 0, suscripciones: 0, alertas: 0, enlaces: 0, comentarios: 0, brevo: 'no-estaba' })
      expect(ids('user')).toEqual(['u1', 'u2'])
    })
  })

  describe('borrarDelBoletin', () => {
    it('borra todas las filas del boletín y el contacto, y nada más', async () => {
      const r = await borrarDelBoletin('ana@x.cl')

      expect(r).toEqual({ suscripciones: 2, brevo: 'borrado' })
      expect(ids('pendingSubscription')).toEqual(['s3'])
      expect(ids('user'), 'sacar del boletín borró la cuenta').toEqual(['u1', 'u2'])
      expect(ids('alertSubscription')).toEqual(['a1', 'a2'])
    })

    it('también barre Brevo después de borrar las filas', async () => {
      await borrarDelBoletin('ana@x.cl')

      const ultimaBrevo = Math.max(...mockBrevo.deleteContact.mock.invocationCallOrder)
      const local = mockPrisma.pendingSubscription.deleteMany.mock.invocationCallOrder[0]
      expect(ultimaBrevo).toBeGreaterThan(local)
    })

    it('sin id guardado, igual borra en Brevo por el correo (quien volvió tras una baja)', async () => {
      tablas.pendingSubscription = [{ id: 's9', email: 'ana@x.cl', plunkContactId: null, confirmedAt: new Date() }]

      await borrarDelBoletin('ana@x.cl')

      expect(mockBrevo.deleteContact).toHaveBeenCalledWith('ana@x.cl')
    })

    it('si Brevo cae, la fila se queda', async () => {
      mockBrevo.deleteContact.mockRejectedValue(http(500))

      await expect(borrarDelBoletin('ana@x.cl')).rejects.toBeInstanceOf(BrevoNoRespondeError)
      expect(ids('pendingSubscription')).toEqual(['s1', 's2', 's3'])
    })
  })

  describe('vistaPreviaSupresion', () => {
    it('cuenta lo que se borraría sin borrar nada', async () => {
      const v = await vistaPreviaSupresion('ANA@x.cl')

      expect(v).toEqual({ cuentas: 1, suscripciones: 2, alertas: 1, enlaces: 1, comentarios: 1, brevo: 'esta' })
      expect(mockBrevo.deleteContact).not.toHaveBeenCalled()
      expect(ids('user')).toEqual(['u1', 'u2'])
    })

    it('distingue «no está en Brevo» de «Brevo no respondió»', async () => {
      mockBrevo.getContact.mockRejectedValueOnce(http(404))
      expect((await vistaPreviaSupresion('ana@x.cl')).brevo).toBe('no-esta')

      mockBrevo.getContact.mockRejectedValueOnce(http(503))
      expect((await vistaPreviaSupresion('ana@x.cl')).brevo).toBe('desconocido')
    })
  })
})
