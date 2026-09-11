import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const mockAxiosInstance = {
  post: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}

vi.mock('axios', () => ({
  default: {
    create: () => mockAxiosInstance,
  },
}))

const mockResolveMx = vi.fn()
vi.mock('dns/promises', () => ({
  resolveMx: mockResolveMx,
}))

const {
  createCampaign,
  sendCampaign,
  getCampaignStats,
  createContact,
  updateContact,
  sendTransactional,
  verifyEmail,
} = await import('./brevo.js')

describe('Brevo API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createCampaign', () => {
    it('creates a campaign and returns data', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { id: 42 } })

      const result = await createCampaign({
        name: 'Test',
        subject: 'Subject',
        body: '<h1>Hello</h1>',
        audienceType: 'ALL',
      })

      expect(result).toMatchObject({ id: '42', name: 'Test', status: 'draft', type: 'classic' })
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/emailCampaigns',
        expect.objectContaining({ name: 'Test', subject: 'Subject', htmlContent: '<h1>Hello</h1>' }),
      )
    })
  })

  describe('sendCampaign', () => {
    it('sends immediately when no scheduledFor', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: {} })
      await sendCampaign('campaign-1')
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/emailCampaigns/campaign-1/sendNow')
      expect(mockAxiosInstance.put).not.toHaveBeenCalled()
    })

    it('schedules send when scheduledFor is provided', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: {} })
      mockAxiosInstance.post.mockResolvedValue({ data: {} })
      await sendCampaign('campaign-1', '2025-01-15T10:00:00Z')
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/emailCampaigns/campaign-1',
        { scheduledAt: '2025-01-15T10:00:00Z' },
      )
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/emailCampaigns/campaign-1/sendNow')
    })
  })

  describe('getCampaignStats', () => {
    it('returns campaign stats', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          statistics: {
            campaignStats: {
              delivered: 100,
              uniqueViews: 50,
              uniqueClicks: 20,
              hardBounces: 1,
              softBounces: 1,
              unsubscriptions: 0,
            },
          },
        },
      })

      const result = await getCampaignStats('campaign-1')
      expect(result).toEqual({ delivered: 100, opened: 50, clicked: 20, bounced: 2, complained: 0 })
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/emailCampaigns/campaign-1')
    })
  })

  describe('createContact', () => {
    it('creates a contact with email and attributes', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { id: 123 } })

      const result = await createContact({ email: 'test@example.com', subscribed: false, data: { confirmToken: 'abc' } })
      expect(result.id).toBe('123')
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/contacts', {
        email: 'test@example.com',
        attributes: { confirmToken: 'abc' },
      })
    })
  })

  describe('updateContact', () => {
    it('updates a contact via PUT', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: {} })

      const result = await updateContact('contact-1', { subscribed: true })
      expect(result.subscribed).toBe(true)
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/contacts/contact-1',
        expect.objectContaining({ listIds: [2], unlinkListIds: [] }),
      )
    })

    it('al re-suscribir levanta la lista de supresion, o la baja seria irreversible', async () => {
      // Volver a la lista no basta: si el contacto quedo con emailBlacklisted
      // —que es lo que hace el enlace de baja del pie de la campaña— Brevo no le
      // envia aunque figure en la lista. Sin esta linea, quien se da de baja no
      // puede volver nunca, y el sitio le responde «revisa tu correo».
      mockAxiosInstance.put.mockResolvedValue({ data: {} })

      await updateContact('contact-1', { subscribed: true })

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/contacts/contact-1',
        expect.objectContaining({ emailBlacklisted: false }),
      )
    })

    it('al dar de baja NO toca la lista de supresion', async () => {
      // Solo se levanta al re-suscribir. Escribir emailBlacklisted en la baja
      // seria decidir por la persona en la direccion contraria.
      mockAxiosInstance.put.mockResolvedValue({ data: {} })

      await updateContact('contact-1', { subscribed: false })

      const payload = mockAxiosInstance.put.mock.calls.at(-1)![1] as Record<string, unknown>
      expect(payload).not.toHaveProperty('emailBlacklisted')
      expect(payload).toMatchObject({ listIds: [], unlinkListIds: [2] })
    })

    it('acepta el correo como identificador y lo encodea', async () => {
      // Es el camino de quien vuelve tras darse de baja: su contacto ya existe
      // en Brevo, asi que el alta fallo por duplicado y no hay id que usar.
      mockAxiosInstance.put.mockResolvedValue({ data: {} })

      await updateContact('vuelve+etiqueta@example.com', { subscribed: true })

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/contacts/vuelve%2Betiqueta%40example.com',
        expect.objectContaining({ emailBlacklisted: false }),
      )
    })
  })

  describe('verifyEmail', () => {
    it('returns valid=true when domain has MX records and is not disposable', async () => {
      mockResolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }])

      const result = await verifyEmail('test@example.com')

      expect(result).toEqual({ valid: true, domainExists: true, isDisposable: false })
      expect(mockResolveMx).toHaveBeenCalledWith('example.com')
    })

    it('returns valid=false when MX lookup fails', async () => {
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'))

      const result = await verifyEmail('bad@nonexistent.xyz')
      expect(result).toEqual({ valid: false, domainExists: false, isDisposable: false })
    })

    it('returns isDisposable=true for disposable domains', async () => {
      mockResolveMx.mockResolvedValue([{ exchange: 'mx.mailinator.com', priority: 10 }])

      const result = await verifyEmail('test@mailinator.com')
      expect(result.isDisposable).toBe(true)
      expect(result.valid).toBe(false)
    })
  })

  describe('sendTransactional', () => {
    it('sends a transactional email via /smtp/email', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: {} })
      await sendTransactional({ to: 'test@example.com', subject: 'Confirm', body: '<p>Confirm</p>' })
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/smtp/email', expect.objectContaining({
        to: [{ email: 'test@example.com' }],
        subject: 'Confirm',
        htmlContent: '<p>Confirm</p>',
      }))
    })
  })
})

/**
 * Las direcciones de los lectores no van en claro a los logs.
 *
 * `subscribe.ts` ya enmascaraba en sus ocho registros y este archivo en
 * NINGUNO: el 11-sep-2026 tenia siete lineas con la direccion completa, tres de
 * ellas en el camino de cada alta —«creating contact», «sending transactional
 * email» y «email verified via MX lookup»—. Esos archivos viven catorce dias en
 * almacenamiento persistente.
 *
 * El test lee el fuente porque el logger esta mockeado en toda la suite, asi
 * que ninguna asercion sobre una llamada podria ver lo que se escribe de
 * verdad.
 */
describe('los logs de Brevo no llevan correos en claro', () => {
  const FUENTE = readFileSync(path.resolve(__dirname, 'brevo.ts'), 'utf8')

  it('cada registro con un correo lo pasa por maskEmail', () => {
    const sinEnmascarar = FUENTE.split('\n')
      .map((linea, i) => ({ linea: linea.trim(), n: i + 1 }))
      .filter(({ linea }) => /log\.(info|warn|error|debug)\(/.test(linea))
      .filter(({ linea }) => /\b(email|to):/.test(linea))
      .filter(({ linea }) => !linea.includes('maskEmail'))
      .map(({ linea, n }) => `L${n}: ${linea.slice(0, 80)}`)

    expect(
      sinEnmascarar,
      `estos registros escriben la direccion completa del lector en los logs:\n${sinEnmascarar.join('\n')}`,
    ).toEqual([])
  })

  it('el modulo importa maskEmail', () => {
    expect(
      /import \{[^}]*maskEmail[^}]*\} from '\.\.\/lib\/logger\.js'/.test(FUENTE),
      'brevo.ts dejo de importar maskEmail',
    ).toBe(true)
  })
})
