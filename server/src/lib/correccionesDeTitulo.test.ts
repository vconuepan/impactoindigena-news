import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { planDeCorrecciones, motivoDeInvalidez } from './correccionesDeTitulo.js'

const actuales = new Map([
  ['a', { title: 'Scjn reconoce deuda histórica', titleEn: 'Scjn recognizes historic debt' }],
  ['b', { title: 'Elisa Loncón impulsa liderazgo', titleEn: null }],
  ['c', { title: 'Editado a mano en el panel', titleEn: null }],
])

describe('planDeCorrecciones', () => {
  it('aplica solo si el campo sigue diciendo lo que decía al revisarlo', () => {
    const plan = planDeCorrecciones([
      { id: 'a', campo: 'title', antes: 'Scjn reconoce deuda histórica', ahora: 'SCJN reconoce deuda histórica' },
      { id: 'a', campo: 'titleEn', antes: 'Scjn recognizes historic debt', ahora: 'SCJN recognizes historic debt' },
      { id: 'b', campo: 'title', antes: 'Elisa loncón impulsa liderazgo', ahora: 'Elisa Loncón impulsa liderazgo' },
      { id: 'c', campo: 'title', antes: 'Lider Mapuche denuncia', ahora: 'Líder Mapuche denuncia' },
      { id: 'z', campo: 'title', antes: 'x', ahora: 'y' },
    ], actuales)
    expect(plan.aplicar.map((c) => `${c.id}:${c.campo}`)).toEqual(['a:title', 'a:titleEn'])
    expect(plan.yaAplicadas.map((c) => c.id)).toEqual(['b'])
    expect(plan.cambiaron.map((c) => [c.id, c.actual])).toEqual([['c', 'Editado a mano en el panel']])
    expect(plan.noExisten.map((c) => c.id)).toEqual(['z'])
  })

  it('una entrada mal formada o repetida no se aplica y se nombra', () => {
    const plan = planDeCorrecciones([
      { id: 'a', campo: 'summary', antes: 'x', ahora: 'y' },
      { id: 'a', campo: 'title', antes: 'igual', ahora: 'igual' },
      { id: 'a', campo: 'title', antes: 'Scjn reconoce deuda histórica', ahora: 'SCJN reconoce deuda histórica' },
      { id: 'a', campo: 'title', antes: 'Scjn reconoce deuda histórica', ahora: 'Otra cosa' },
      'texto',
    ], actuales)
    expect(plan.aplicar).toHaveLength(1)
    expect(plan.invalidas.map((i) => i.motivo)).toEqual([
      'campo desconocido', '«antes» y «ahora» son iguales', 'repetida: dos correcciones para el mismo campo', 'no es un objeto',
    ])
  })

  it('rechaza un «ahora» con espacios de más o saltos de línea', () => {
    expect(motivoDeInvalidez({ id: 'a', campo: 'title', antes: 'x', ahora: 'y ' })).toMatch(/espacios/)
    expect(motivoDeInvalidez({ id: 'a', campo: 'title', antes: 'x', ahora: 'a  b' })).toMatch(/espacios/)
    expect(motivoDeInvalidez({ id: 'a', campo: 'title', antes: 'x', ahora: 'a\nb' })).not.toBeNull()
  })
})

// El archivo de datos que se aplica en producción: cada entrada tiene que ser
// válida, sin repetidos. Si alguien lo edita a mano y lo rompe, falla aquí y no
// a mitad de una escritura sobre la base.
describe('los archivos de correcciones revisadas', () => {
  const leer = (nombre: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../scripts/migrations/data/${nombre}`, import.meta.url)), 'utf8')) as unknown[]
  // Juntos, como los lee el script con --con-palabras: un mismo campo no puede
  // estar en los dos.
  const entradas = [...leer('titulos-revisados-2026-11-24.json'), ...leer('titulos-con-cambio-de-palabras-2026-11-24.json')]

  it('el archivo mecánico solo cambia mayúsculas, tildes, puntuación o cifras: ninguna palabra', () => {
    const plano = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')
    for (const e of leer('titulos-revisados-2026-11-24.json') as Array<{ antes: string; ahora: string }>) {
      expect(plano(e.ahora), e.antes).toBe(plano(e.antes))
    }
  })

  it('no traen ninguna entrada inválida ni repetida', () => {
    const todas = new Map(
      (entradas as Array<{ id: string }>).map((e) => [e.id, { title: null, titleEn: null }]),
    )
    const plan = planDeCorrecciones(entradas, todas)
    expect(plan.invalidas).toEqual([])
    expect(plan.cambiaron.length + plan.aplicar.length + plan.yaAplicadas.length).toBe(entradas.length)
  })
})
