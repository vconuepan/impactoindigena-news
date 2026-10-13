import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import AlertsPage from './AlertsPage'

/**
 * La confirmacion de alertas es un acto explicito: un boton que hace un POST.
 *
 * Los filtros de correo corporativos abren los enlaces de un mensaje para
 * revisarlos antes que la persona. Si abrir la pagina confirmara, un pedido de
 * cambio de temas hecho por un tercero quedaria aplicado sin que la titular
 * hiciera nada. Por eso lo que mas importa aqui es lo que NO pasa al cargar.
 *
 * Se simula `fetch` y NO el modulo de API: asi se prueba el POST de verdad
 * (ruta, metodo, Content-Type y cuerpo) y el ApiError real. Sin Content-Type
 * JSON el servidor no lee el cuerpo, responde 400 y todas las confirmaciones
 * fallarian con la suite en verde.
 */
const fetchMock = vi.fn()

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CORREO = 'lectora@example.com'
const conToken = `/alertas?confirm_token=${TOKEN}&email=${encodeURIComponent(CORREO)}`

function respuesta(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

const llamadasConfirm = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/alerts/confirm'))

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
          <Route path="/alertas" element={<><AlertsPage /><Ubicacion /></>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

const botonConfirmar = () => screen.findByRole('button', { name: /^confirmar$/i })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('confirmar alertas desde el sitio', () => {
  it('abrir la pagina con el enlace NO confirma: solo muestra el boton', async () => {
    abrir(conToken)

    expect(await botonConfirmar()).toBeInTheDocument()
    // Le dice a quien esta y que, si no pidio nada, no pasa nada.
    expect(screen.getByText(CORREO)).toBeInTheDocument()
    expect(screen.getByText(/si no lo pediste/i)).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(llamadasConfirm()).toHaveLength(0)
  })

  it('el boton hace UN POST real: ruta, metodo, Content-Type JSON y cuerpo con token y correo', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true, result: 'confirmed' }))
    abrir(conToken)

    await userEvent.click(await botonConfirmar())

    expect(llamadasConfirm()).toHaveLength(1)
    const [url, init] = llamadasConfirm()[0]
    expect(String(url)).toMatch(/\/api\/alerts\/confirm$/)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, email: CORREO })
    expect(await screen.findByText(/alertas activadas/i)).toBeInTheDocument()
    expect(screen.getByText(/un correo al día/i)).toBeInTheDocument()
  })

  it('si era un cambio de temas lo dice', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true, result: 'changed' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())
    expect(await screen.findByText(/temas se actualizaron/i)).toBeInTheDocument()
  })

  it('un enlace ya usado (already) muestra que las alertas estan activas', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true, result: 'already' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())
    expect(await screen.findByText(/alertas activadas/i)).toBeInTheDocument()
  })

  it('despues de confirmar, el token y el correo salen de la barra de direcciones', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true, result: 'confirmed' }))
    abrir(conToken)
    expect(paramsActuales().get('email')).toBe(CORREO) // el punto de partida tiene los dos

    await userEvent.click(await botonConfirmar())
    await screen.findByText(/alertas activadas/i)

    await waitFor(() => expect(paramsActuales().get('confirm_token')).toBeNull())
    expect(paramsActuales().get('email')).toBeNull()
  })

  it('un enlace vencido lo explica, no deja reintentar y limpia la URL', async () => {
    fetchMock.mockImplementation(() => respuesta(400, { error: 'expired' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())

    expect(await screen.findByText(/enlace expirado/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^confirmar$/i })).not.toBeInTheDocument()
    await waitFor(() => expect(paramsActuales().get('confirm_token')).toBeNull())
    expect(paramsActuales().get('email')).toBeNull()
  })

  it('un enlace que no coincide dice que es invalido y limpia la URL', async () => {
    fetchMock.mockImplementation(() => respuesta(400, { error: 'invalid' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())

    expect(await screen.findByText(/enlace inválido/i)).toBeInTheDocument()
    await waitFor(() => expect(paramsActuales().get('confirm_token')).toBeNull())
    expect(paramsActuales().get('email')).toBeNull()
  })

  it('tras un fallo de red, un segundo clic hace un segundo POST y confirma', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementationOnce(() => respuesta(200, { success: true, result: 'confirmed' }))
    abrir(conToken)

    await userEvent.click(await botonConfirmar())
    expect(await screen.findByText(/no se pudo confirmar/i)).toBeInTheDocument()

    const boton = await botonConfirmar()
    expect(boton).toBeEnabled()
    await userEvent.click(boton)

    expect(llamadasConfirm()).toHaveLength(2)
    expect(await screen.findByText(/alertas activadas/i)).toBeInTheDocument()
  })

  // El limitador de /api/alerts es compartido por alta, confirmacion y baja: quien
  // reenvio el formulario un par de veces puede recibir 429 al confirmar. Eso se
  // reintenta despues; no es un enlace muerto.
  it('un 429 del limitador deja reintentar y conserva el token en la URL', async () => {
    fetchMock.mockImplementation(() => respuesta(429, { error: 'Too many attempts. Please try again later.' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())

    expect(await screen.findByText(/no se pudo confirmar/i)).toBeInTheDocument()
    expect(await botonConfirmar()).toBeEnabled()
    expect(paramsActuales().get('confirm_token')).toBe(TOKEN)
    expect(screen.queryByText(/enlace inválido/i)).not.toBeInTheDocument()
  })

  it('un 500 del servidor tambien deja reintentar', async () => {
    fetchMock.mockImplementation(() => respuesta(500, { error: 'Failed to confirm' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())
    expect(await screen.findByText(/no se pudo confirmar/i)).toBeInTheDocument()
    expect(await botonConfirmar()).toBeEnabled()
  })

  it('no manda dos POST si se hace doble clic', async () => {
    let resolver: (r: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>((r) => { resolver = r }))
    abrir(conToken)

    await userEvent.dblClick(await botonConfirmar())
    expect(llamadasConfirm()).toHaveLength(1)

    resolver(new Response(JSON.stringify({ success: true, result: 'confirmed' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await screen.findByText(/alertas activadas/i)
  })

  it('la region viva existe vacia desde el inicio y despues anuncia el resultado', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true, result: 'confirmed' }))
    abrir(conToken)

    // Si apareciera junto con el texto, varios lectores de pantalla no la anuncian.
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()

    await userEvent.click(await botonConfirmar())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/alertas activadas/i))
  })

  it('un correo largo puede partirse dentro de la caja', async () => {
    const largo = 'coordinacion.territorial@empresasindigenas.org'
    abrir(`/alertas?confirm_token=${TOKEN}&email=${encodeURIComponent(largo)}`)
    const correo = await screen.findByText(largo)
    expect(correo.className).toContain('[overflow-wrap:anywhere]')
  })

  it('sin token en la URL no aparece la confirmacion ni se llama a la API', async () => {
    abrir('/alertas')
    expect(screen.queryByRole('button', { name: /^confirmar$/i })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(llamadasConfirm()).toHaveLength(0)
  })

  it('al terminar, el foco va al resultado y no se pierde con el boton', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { success: true, result: 'confirmed' }))
    abrir(conToken)
    await userEvent.click(await botonConfirmar())

    const texto = await screen.findByText(/alertas activadas/i)
    const resultado = texto.closest('[tabindex="-1"]') as HTMLElement
    expect(resultado, 'el resultado no es enfocable').not.toBeNull()
    await waitFor(() => expect(resultado).toHaveFocus())
  })

  it.each([
    ['un token que no es uuid', `/alertas?confirm_token=no-es-uuid&email=${encodeURIComponent(CORREO)}`],
    ['un token con html', `/alertas?confirm_token=${encodeURIComponent('<img src=x onerror=alert(1)>')}&email=${encodeURIComponent(CORREO)}`],
    ['un correo sin forma de correo', `/alertas?confirm_token=${TOKEN}&email=basura`],
    ['un token sin correo', `/alertas?confirm_token=${TOKEN}`],
    ['un correo sin token', `/alertas?email=${encodeURIComponent(CORREO)}`],
  ])('%s es un enlace recortado: avisa de invalido, no ofrece confirmar ni refleja el texto', async (_nombre, ruta) => {
    abrir(ruta)

    expect(await screen.findByText('Enlace inválido')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^confirmar$/i })).not.toBeInTheDocument()
    // El texto del enlace no se refleja. (`ubicacion` es el ayudante del test que pinta la URL.)
    expect(screen.queryAllByText(/basura|onerror/).filter((e) => e.dataset.testid !== 'ubicacion')).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 20))
    expect(llamadasConfirm()).toHaveLength(0)
  })
})
