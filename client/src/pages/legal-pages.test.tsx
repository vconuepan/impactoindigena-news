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
