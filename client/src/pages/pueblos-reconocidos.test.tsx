import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import ChileHubPage from './ChileHubPage'

/**
 * Los pueblos que el Estado reconoce los fija el art. 1° de la Ley 19.253, y
 * desde abril de 2026 el sitio decia «diez», inventaba un pueblo «Lamas
 * (Lafkenche)» y omitia al chango (Ley 21.273, 2020) y al selk'nam (Ley
 * 21.606, 2023). Lo encontro la revision del 5-oct-2026; estuvo seis meses
 * en vivo en una guia indexada. Este test ata lo publicado al texto legal.
 *
 * Fuente: Ley 19.253, art. 1°, texto vigente (BCN, version del 29-9-2025):
 * «Mapuche, Aimara, Rapa Nui o Pascuense; Atacameño, Quechua, Colla, Diaguita,
 * Chango del norte del pais; Kawashkar o Alacalufe y Yamana o Yagan de los
 * canales australes; y Selk'nam».
 */
const PUEBLOS_SEGUN_LA_LEY = [
  'Mapuche',
  'Aymara',
  'Rapa Nui',
  'Atacameño (Lickanantay)',
  'Quechua',
  'Colla',
  'Diaguita',
  'Chango',
  'Kawésqar',
  'Yagán',
  "Selk'nam",
].sort()

const SUPERFICIES = [
  'pages/ChileHubPage.tsx',
  'pages/GuidesIndexPage.tsx',
  'pages/MapPage.tsx',
  'pages/MapuchePage.tsx',
  'pages/GlossaryPage.tsx',
  'components/MapWidget.tsx',
  'data/snippets.ts',
]

describe('Pueblos reconocidos: lo publicado coincide con el art. 1° de la Ley 19.253', () => {
  it('la guia muestra once pueblos, los de la ley, y ninguno inventado', () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <ChileHubPage />
        </MemoryRouter>
      </HelmetProvider>,
    )
    const tarjetas = screen.getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent?.trim() ?? '')
      .filter((t) => PUEBLOS_SEGUN_LA_LEY.includes(t) || /lamas|lafkenche/i.test(t))
    expect(tarjetas.sort()).toEqual(PUEBLOS_SEGUN_LA_LEY)
    expect(screen.queryByText(/lamas/i)).toBeNull()
  })

  it('ninguna superficie publica dice «diez pueblos», nombra a «lamas» como pueblo ni cita el Censo 2017', () => {
    for (const rel of SUPERFICIES) {
      const fuente = readFileSync(path.resolve(__dirname, '..', rel), 'utf8')
      expect(fuente, `${rel} dice «diez pueblos»`).not.toMatch(/diez pueblos/i)
      expect(fuente, `${rel} nombra a «lamas» como pueblo`).not.toMatch(/\bLamas\b/)
      expect(fuente, `${rel} sigue citando el Censo 2017`).not.toMatch(/Censo 2017/)
    }
  })

  it('el mapa pinta los once pueblos de la ley y no un subgrupo como pueblo aparte', () => {
    const fuente = readFileSync(path.resolve(__dirname, '../components/MapWidget.tsx'), 'utf8')
    const bloque = fuente.match(/const PUEBLOS: PuebloData\[\] = \[([\s\S]*?)\n\]/)
    expect(bloque, 'no se encontro PUEBLOS en MapWidget.tsx').not.toBeNull()
    const nombres = [...bloque![1].matchAll(/^\s*nombre: (['"])(.+?)\1,?$/gm)].map((m) => m[2])
    expect(nombres).toHaveLength(11)
    expect(nombres).not.toContain('Lafkenche')
    expect(nombres).toContain('Chango')
    expect(nombres).toContain("Selk'nam")
  })
})
