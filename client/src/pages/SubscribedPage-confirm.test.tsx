import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import es from '../locales/es.json'
import en from '../locales/en.json'
import SubscribedPage from './SubscribedPage'

/**
 * La confirmacion del boletin es un acto explicito: un boton que hace un POST.
 *
 * Los filtros de correo corporativos abren los enlaces de un mensaje para
 * revisarlos antes que la persona. Si abrir la pagina confirmara, quien recibe
 * un correo escrito por un tercero quedaria suscrita sin haber hecho nada. Por
 * eso lo que mas importa aqui es lo que NO pasa al cargar.
 *
 * Se simula `fetch` y NO el modulo de API: asi se prueba el POST de verdad
 * (ruta, metodo, Content-Type y cuerpo) y el ApiError real. Sin Content-Type
 * JSON el servidor no lee el cuerpo, responde 400 y todas las confirmaciones
 * fallarian con la suite en verde.
 */
const idioma = vi.hoisted(() => ({ actual: {} as Record<string, unknown> }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (clave: string) =>
      clave.split('.').reduce<any>((nodo, parte) => (nodo == null ? undefined : nodo[parte]), idioma.actual) ?? clave,
  }),
}))

const fetchMock = vi.fn()

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CORREO = 'lectora@example.com'
const conToken = `/subscribed?confirm_token=${TOKEN}&email=${encodeURIComponent(CORREO)}`
const T = (es as any).subscribed

function respuesta(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

const llamadasConfirm = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/subscribe/confirm'))

function Ubicacion() {
  const l = useLocation()
  return <span data-testid="ubicacion">{l.pathname + l.search}</span>
}

/** Los parametros de la URL actual, leidos como parametros: un `@` viaja como %40. */
function paramsActuales() {
  const texto = screen.getByTestId('ubicacion').textContent ?? ''
  return new URLSearchParams(texto.split('?')[1] ?? '')
}

function abrir(ruta: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/subscribed" element={<><SubscribedPage /><Ubicacion /></>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

const botonConfirmar = () => screen.findByRole('button', { name: T.confirmButton })
const titulo = (nombre: string) => screen.findByRole('heading', { name: nombre })

beforeEach(() => {
  idioma.actual = es as Record<string, unknown>
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('confirmar el boletin desde el sitio', () => {
  it('abrir la pagina con el enlace NO confirma: solo muestra el boton', async () => {
    abrir(conToken)

    expect(await botonConfirmar()).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: T.confirmTitle })).toBeInTheDocument()
    // Le dice a quien esta y que, si no pidio nada, no pasa nada.
    expect(screen.getByText(CORREO)).toBeInTheDocument()
    expect(screen.getByText(T.confirmIgnore)).toBeInTheDocument()
    // Y NO celebra todavia: la bienvenida es despues de confirmar.
    expect(screen.queryByRole('heading', { name: T.successTitle })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(
      llamadasConfirm(),
      'cargar la pagina hizo un POST: un escaner de correo confirmaria la suscripcion de cualquiera',
    ).toHaveLength(0)
  })

  it('la pagina con token no se indexa', async () => {
    abrir(conToken)
    await botonConfirmar()
    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
    })
  })

  it('el boton hace UN POST real: ruta, metodo, Content-Type JSON y cuerpo con token y correo', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true }))
    abrir(conToken)

    await userEvent.click(await botonConfirmar())

    expect(llamadasConfirm()).toHaveLength(1)
    const [url, init] = llamadasConfirm()[0]
    expect(String(url)).toMatch(/\/api\/subscribe\/confirm$/)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, email: CORREO })
    expect(await titulo(T.successTitle)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: T.confirmButton })).not.toBeInTheDocument()
  })

  it('despues de confirmar, el token y el correo salen de la barra de direcciones', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true }))
    abrir(conToken)
    expect(paramsActuales().get('email')).toBe(CORREO) // el punto de partida tiene los dos

    await userEvent.click(await botonConfirmar())

    await waitFor(() => expect(paramsActuales().get('confirm_token')).toBeNull())
    expect(paramsActuales().get('email')).toBeNull()
    // La bienvenida sigue en pantalla aunque la URL ya no tenga el token.
    expect(screen.getByRole('heading', { name: T.successTitle })).toBeInTheDocument()
  })

  it('al terminar, el foco va al titulo del resultado', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())

    const h1 = await titulo(T.successTitle)
    await waitFor(() => expect(h1).toHaveFocus())
  })

  it('dos clics en el mismo instante mandan un solo POST', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    abrir(conToken)

    const boton = await botonConfirmar()
    // Los dos clics llegan antes de que React repinte: el boton todavia NO esta
    // deshabilitado, asi que solo el cerrojo del manejador evita el segundo POST.
    // `userEvent.dblClick` no sirve aca: deja repintar entre un clic y otro.
    act(() => {
      boton.click()
      boton.click()
    })

    expect(llamadasConfirm(), 'dos clics seguidos mandaron dos POST').toHaveLength(1)
  })

  it('mientras espera, el boton lo dice y no se puede volver a apretar', async () => {
    let resolver!: (r: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((r) => { resolver = r }))
    abrir(conToken)

    await userEvent.click(await botonConfirmar())

    expect(screen.getByRole('button', { name: T.confirming })).toBeDisabled()
    resolver(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    expect(await titulo(T.successTitle)).toBeInTheDocument()
  })

  it('un enlace vencido (400 expired) muestra el aviso de expirado y limpia la URL', async () => {
    fetchMock.mockImplementation(() => respuesta(400, { error: 'expired' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())

    expect(await titulo(T.expiredTitle)).toBeInTheDocument()
    expect(screen.getByText(T.expiredBody)).toBeInTheDocument()
    await waitFor(() => expect(paramsActuales().get('confirm_token')).toBeNull())
    expect(paramsActuales().get('email')).toBeNull()
  })

  it('un enlace invalido (400 invalid) muestra el aviso de invalido y limpia la URL', async () => {
    fetchMock.mockImplementation(() => respuesta(400, { error: 'invalid' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())

    expect(await titulo(T.invalidTitle)).toBeInTheDocument()
    await waitFor(() => expect(paramsActuales().get('confirm_token')).toBeNull())
  })

  it.each([
    ['un error del servidor (500)', () => respuesta(500, { error: 'Failed to confirm' })],
    ['el limite de intentos (429)', () => respuesta(429, { error: 'Too many subscription attempts. Please try again later.' })],
    ['una red caida', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('%s NO descarta el enlace: avisa y deja reintentar', async (_nombre, falla) => {
    fetchMock.mockImplementationOnce(falla)
    abrir(conToken)
    await userEvent.click(await botonConfirmar())

    expect(await screen.findByText(T.confirmError)).toBeInTheDocument()
    // El enlace sigue vivo: ni el boton ni la URL se fueron.
    expect(screen.queryByRole('heading', { name: T.invalidTitle })).not.toBeInTheDocument()
    expect(paramsActuales().get('confirm_token')).toBe(TOKEN)

    // Y el reintento funciona.
    fetchMock.mockImplementation(() => respuesta(200, { success: true }))
    await userEvent.click(await botonConfirmar())
    expect(await titulo(T.successTitle)).toBeInTheDocument()
    expect(llamadasConfirm()).toHaveLength(2)
  })

  it('el aviso de error vive en una region viva que ya estaba en la pagina', async () => {
    fetchMock.mockImplementationOnce(() => respuesta(500, { error: 'Failed to confirm' }))
    abrir(conToken)
    await botonConfirmar()
    // Antes del error la region ya existe y esta vacia: asi el aviso se anuncia.
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()

    await userEvent.click(screen.getByRole('button', { name: T.confirmButton }))
    await screen.findByText(T.confirmError)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent(T.confirmError)
  })

  it('un correo largo y sin puntos de corte no se sale de la pagina', async () => {
    const largo = `${'a'.repeat(80)}@example.com`
    abrir(`/subscribed?confirm_token=${TOKEN}&email=${encodeURIComponent(largo)}`)
    const correo = await screen.findByText(largo)
    expect(correo.className).toContain('overflow-wrap:anywhere')
  })

  it('en ingles todo el texto esta en ingles', async () => {
    idioma.actual = en as Record<string, unknown>
    abrir(conToken)

    expect(await screen.findByRole('button', { name: (en as any).subscribed.confirmButton })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: (en as any).subscribed.confirmTitle })).toBeInTheDocument()
    expect(screen.getByText((en as any).subscribed.confirmIgnore)).toBeInTheDocument()
  })
})

describe('los caminos que ya existian siguen igual', () => {
  it('/subscribed a secas muestra la bienvenida y no llama a nadie', async () => {
    abrir('/subscribed')

    expect(await titulo(T.successTitle)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: T.confirmButton })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('?error=expired (enlace sin token) muestra el aviso, sin foco robado', async () => {
    abrir('/subscribed?error=expired')

    const h1 = await titulo(T.expiredTitle)
    expect(h1).not.toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('?error=invalid muestra el aviso de invalido', async () => {
    abrir('/subscribed?error=invalid')
    expect(await titulo(T.invalidTitle)).toBeInTheDocument()
  })

  it('con token Y error, manda el token: se puede confirmar', async () => {
    abrir(`${conToken}&error=invalid`)
    expect(await botonConfirmar()).toBeInTheDocument()
  })

  it.each([
    ['un token sin correo', `/subscribed?confirm_token=${TOKEN}`],
    ['un correo sin token', `/subscribed?email=${encodeURIComponent(CORREO)}`],
    ['un token que no es uuid', `/subscribed?confirm_token=no-es-uuid&email=${encodeURIComponent(CORREO)}`],
    ['un correo sin forma de correo', `/subscribed?confirm_token=${TOKEN}&email=basura`],
  ])('%s es un enlace recortado: avisa de invalido y no celebra ni muestra el boton', async (_nombre, ruta) => {
    abrir(ruta)
    expect(await titulo(T.invalidTitle)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: T.successTitle })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: T.confirmButton })).not.toBeInTheDocument()
    expect(screen.queryByText('basura')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
