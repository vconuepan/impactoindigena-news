import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import PrivacyPage from './PrivacyPage'
import TermsPage from './TermsPage'
import CookiesPage from './CookiesPage'

/**
 * Las tres paginas legales son afirmaciones publicas verificables, no copy. Este
 * archivo fija lo que se corrigio el 7-sep-2026 despues de una auditoria que
 * encontro tres clases de defecto:
 *
 * 1. Un tercero real —las teselas de OpenStreetMap del mapa— que recibia la IP
 *    de cada lector sin estar declarado en ningun texto.
 * 2. Dos operadores distintos del Sitio segun la pagina que se mirara.
 * 3. Textos que cambiaron sin subir su numero de version, de modo que el lector
 *    veia una fecha de vigencia que no correspondia al texto servido.
 *
 * Ninguno rompia la pagina: se veian perfectas mientras decian algo que no era.
 * Por eso lo que se prueba aqui es la CORRESPONDENCIA con la realidad, no el
 * renderizado.
 */

function renderPage(component: React.ReactElement) {
  return render(
    <HelmetProvider>
      <MemoryRouter>{component}</MemoryRouter>
    </HelmetProvider>,
  )
}

const PAGINAS = [
  { nombre: 'Politica de Privacidad', componente: <PrivacyPage /> },
  { nombre: 'Terminos y Condiciones', componente: <TermsPage /> },
  { nombre: 'Politica de Cookies', componente: <CookiesPage /> },
]

describe('las tres paginas legales declaran su vigencia', () => {
  for (const { nombre, componente } of PAGINAS) {
    it(`${nombre}: muestra numero de version y fecha al lector`, () => {
      renderPage(componente)
      // El formato es «Version X.Y · vigente desde el D de MES de AAAA». Si el
      // texto cambia sin tocar esta linea, el lector ve una fecha falsa — que es
      // exactamente lo que paso con los Terminos entre el 23-ago y el 7-sep.
      expect(screen.getByText(/Versi[oó]n \d+\.\d+ · vigente desde el \d{1,2} de \w+ de \d{4}\./)).toBeInTheDocument()
    })
  }
})

describe('un solo operador del Sitio, y es el que tiene RUT', () => {
  for (const { nombre, componente } of PAGINAS) {
    it(`${nombre}: nombra a la Fundacion KM`, () => {
      renderPage(componente)
      expect(screen.getAllByText(/Fundación KM/).length).toBeGreaterThan(0)
    })
  }

  it('el nombre de la Fundacion se escribe igual en todo el sitio', () => {
    // Hasta el 7-sep-2026 la lista de la Red Indigena Colaborativa la llamaba
    // «Fundacion Konwepang-Millakir por el respeto del mapu» —la grafia en
    // grafemario mapuche— mientras los seis lugares legales decian «Coñuepan-
    // Millaquir». El director confirmo que es la MISMA entidad. Dos grafias del
    // responsable del tratamiento en una sola sesion de navegacion debilitan la
    // cadena de a quien se le reclama, asi que el sitio usa una sola.
    //
    // El 3-oct-2026 el director eligio «Fundacion KM», que es uno de los cinco
    // nombres inscritos de la misma persona juridica (RUT 65.191.983-5). Desde
    // entonces tampoco vale «Coñuepan-Millaquir»: un solo nombre en todo el sitio.
    //
    // Se lee del fuente y no del render porque el nombre aparece en paginas
    // distintas; lo que se vigila es el repositorio entero.
    const paginas = path.resolve(__dirname)
    for (const archivo of ['AboutPage.tsx', 'MethodologyPage.tsx', 'ImprintPage.tsx', 'TermsPage.tsx', 'PrivacyPage.tsx', 'CookiesPage.tsx']) {
      const fuente = readFileSync(path.join(paginas, archivo), 'utf8')
      expect(fuente, `${archivo} usa otro nombre de la Fundacion que «Fundación KM»`).not.toMatch(/Konwepang|Millakir|Coñuepan-Millaquir/)
    }
  })

  it('ninguna de las tres presenta a la SpA como operadora del Sitio', () => {
    // El 7-sep el sitio declaraba dos personas juridicas distintas como
    // contraparte: la Fundacion en Terminos y «Voces Indigenas SpA, la empresa
    // matriz de esta plataforma» en Nosotros y Metodologia. La contraparte de un
    // contrato tiene que ser una sola.
    for (const { componente } of PAGINAS) {
      const { unmount } = renderPage(componente)
      expect(screen.queryByText(/empresa matriz/i)).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('el tercero que recibe la IP del lector esta declarado', () => {
  it('la Politica de Privacidad nombra a OpenStreetMap en la tabla de encargados', () => {
    // /mapa hace 27 peticiones a *.tile.openstreetmap.org, medidas en vivo el
    // 7-sep-2026. La IP es dato personal y esa comunicacion tiene que estar
    // declarada. Si alguien quita el mapa, este test debe borrarse a conciencia,
    // no «arreglarse» quitando la fila.
    renderPage(<PrivacyPage />)
    // La fila de la tabla, no una mencion cualquiera: lo que la ley exige es que
    // figure como destinatario con su ubicacion y los datos involucrados.
    const celda = screen.getAllByText('OpenStreetMap').find((n) => n.tagName === 'TD')
    expect(celda, 'OpenStreetMap no aparece como fila de la tabla de encargados').toBeDefined()
    const fila = celda!.closest('tr')
    expect(fila?.textContent).toMatch(/Reino Unido/)
    expect(fila?.textContent).toMatch(/direcci[oó]n IP/)
  })

  it('la Politica de Cookies explica que el mapa no instala cookies pero expone la IP', () => {
    renderPage(<CookiesPage />)
    const encabezado = screen.getByRole('heading', { name: /contenido de terceros/i })
    const seccion = encabezado.parentElement
    expect(seccion?.textContent).toMatch(/OpenStreetMap/)
    expect(seccion?.textContent).toMatch(/no instala/i)
    expect(seccion?.textContent).toMatch(/direcci[oó]n IP/)
  })

  it('la Politica declara que los datos de lectores transitan por Static Web Apps si la API va por su proxy', () => {
    // Hasta la v3.3 la Politica decia que esa entrega «no involucra datos de
    // suscriptores». Pero el despliegue compila el cliente con VITE_API_URL=""
    // (mismo origen), asi que TODA peticion a /api —suscripcion, sesion,
    // membresias, ARCO— cruza el proxy de Static Web Apps antes de llegar a
    // Chile. Si algun dia la API se llama directo, este test debe reescribirse.
    const workflow = readFileSync(
      path.resolve(__dirname, '../../../.github/workflows/deploy-azure-frontend.yml'),
      'utf8',
    )
    if (!/VITE_API_URL:\s*""/.test(workflow)) return
    renderPage(<PrivacyPage />)
    const celda = screen.getAllByText('Azure Static Web Apps').find((n) => n.tagName === 'TD')
    const fila = celda!.closest('tr')
    expect(fila?.textContent).toMatch(/API/)
    expect(fila?.textContent).toMatch(/correo/)
    expect(document.body.textContent).not.toMatch(/no involucra datos de suscriptores/)
  })

  it('la Politica de Privacidad ya no dice que Cloudflare R2 va «sin datos de lectores»', () => {
    // R2 sirve las imagenes directo al navegador de cada lector, asi que recibe
    // su IP igual que cualquier servidor. La frase anterior era inexacta.
    renderPage(<PrivacyPage />)
    const filas = screen.getAllByText(/Cloudflare R2/)
    expect(filas.length).toBeGreaterThan(0)
    const fila = filas[0].closest('tr')
    expect(fila?.textContent).not.toMatch(/sin datos de lectores/)
    expect(fila?.textContent).toMatch(/direcci[oó]n IP/)
  })
})

/**
 * Correcciones del 12-oct-2026 (Politica v3.4). Una revision contra el texto
 * oficial de las leyes encontro afirmaciones que eran inexactas en cualquier
 * lectura juridica. Cada test fija una, con su razon.
 */
describe('la Politica no promete lo que no hace ni cita lo que la ley no dice', () => {
  it('no declara «deber de secreto» sobre las noticias que publica', () => {
    // El art. 14 bis de la 21.719 pone bajo secreto el resultado de organizar o
    // clasificar datos de fuentes publicas. Voces clasifica y PUBLICA: declarar
    // ese deber describia como secreto lo que el sitio difunde.
    renderPage(<PrivacyPage />)
    expect(document.body.textContent).not.toMatch(/deber de secreto/i)
  })

  it('no funda el origen etnico de terceros en lo que publico «la fuente»', () => {
    // El art. 16 a) exige que el dato sensible lo haya hecho publico EL TITULAR.
    // Que un medio publique la pertenencia de una persona a un pueblo no la
    // convierte en eso. La regla de fondo esta en consulta juridica; lo que no
    // puede volver es la cita equivocada.
    renderPage(<PrivacyPage />)
    const texto = document.body.textContent ?? ''
    expect(texto).not.toMatch(/o la fuente hicieron/)
    expect(texto).not.toMatch(/art\. 16 a\)/)
  })

  it('no da por firmadas garantias de transferencia que no constan', () => {
    // «las transferencias se amparan en… clausulas contractuales tipo»: no hay
    // constancia de que se hayan suscrito con ningun proveedor. Cuando se firmen,
    // la Politica nombrara la garantia de cada destino.
    renderPage(<PrivacyPage />)
    expect(document.body.textContent).not.toMatch(/se\s+amparan en garant/)
  })

  it('la gratuidad de hoy es la de la 19.628, no la de la 21.719', () => {
    // «el acceso es gratuito al menos una vez por trimestre» es el estandar de la
    // 21.719 dicho en presente: prometia menos que el art. 12 de la 19.628, que
    // hace absolutamente gratuitas la informacion, modificacion y eliminacion.
    renderPage(<PrivacyPage />)
    expect(document.body.textContent).toMatch(/absolutamente gratuitas/)
  })

  it('si Brevo mide aperturas y clics, el titular no dice «Sin rastreo» a secas', () => {
    // Medido el 12-oct-2026 en el informe agregado de Brevo: tambien los correos
    // transaccionales (alertas, resumenes, bienvenida, acceso) registran
    // aperturas. Por eso la frase dice «los correos que te enviamos», no solo
    // los del boletin.
    renderPage(<PrivacyPage />)
    const celda = screen.getAllByText('Brevo').find((n) => n.tagName === 'TD')
    const fila = celda!.closest('tr')
    if (!/apertura/.test(fila?.textContent ?? '')) return
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Sin rastreo en el sitio/)
    expect(document.body.textContent).toMatch(/correos que te enviamos sí miden aperturas y clics/)
  })

  it('las paginas de producto no prometen mas privacidad que la Politica', () => {
    // La Politica dice «Sin rastreo en el sitio» porque los correos miden
    // aperturas y clics. Hasta el 12-oct-2026, /compare ademas prometia «sin
    // recoleccion de datos» —falso: guardamos correos— y se marcaba «Sin
    // rastreo» frente a un competidor criticado por los pixeles de su newsletter.
    const leer = (archivo: string) => readFileSync(path.resolve(__dirname, archivo), 'utf8')
    for (const archivo of ['ComparePage.tsx', 'MethodologyPage.tsx', 'NewsFatiguePage.tsx']) {
      expect(leer(archivo), archivo).not.toMatch(/sin recolección de datos/i)
      expect(leer(archivo), archivo).not.toMatch(/Sin rastreo[,.']/)
    }
    expect(leer('NoAdsNoTrackingPage.tsx')).toMatch(/correos\s+que te enviamos, no solo en el boletín/)
  })

  it('el aviso de consentimiento de comunidades cita la ley vigente', () => {
    // Pedia el consentimiento «conforme a la Ley 21.719», que rige recien el
    // 1-dic-2026. Hoy el dato sensible exige consentimiento (art. 10 de la
    // 19.628), y que sea expreso viene de su art. 4°. La version de la Politica
    // para el 1-dic actualizara tambien este aviso.
    const fuente = readFileSync(path.resolve(__dirname, 'CommunityPage.tsx'), 'utf8')
    expect(fuente).toMatch(/artículos 4° y 10 de la Ley 19\.628/)
    expect(fuente).not.toMatch(/membresía conforme a la Ley 21\.719/)
  })
})
