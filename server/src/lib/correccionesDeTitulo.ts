/**
 * Correcciones de títulos ya publicados, revisadas una por una (A23, 24-nov-2026).
 *
 * `fix-title-capitalization.ts` repara lo que una lista blanca puede ver. Lo que
 * queda no lo ve ninguna lista: siglas escritas como palabra («Scjn»), nombres
 * de persona en minúscula («Elisa loncón»), tildes que faltan, palabras
 * deformadas. Cada corrección de aquí salió de una auditoría de los 5.381
 * títulos y pasó por dos verificadores contra el título original del medio.
 *
 * La corrección se aplica SOLO si el campo sigue diciendo exactamente lo que
 * decía cuando se revisó: si alguien ya lo editó en el panel, no se pisa.
 */

export interface CorreccionDeTitulo {
  id: string
  campo: 'title' | 'titleEn'
  antes: string
  ahora: string
}

export type TitulosActuales = Map<string, { title: string | null; titleEn: string | null }>

export interface PlanDeCorrecciones {
  aplicar: CorreccionDeTitulo[]
  yaAplicadas: CorreccionDeTitulo[]
  /** El campo ya no dice lo que decía al revisarlo: no se toca. */
  cambiaron: Array<CorreccionDeTitulo & { actual: string | null }>
  noExisten: CorreccionDeTitulo[]
  /** Entradas del archivo que no son una corrección válida. */
  invalidas: Array<{ entrada: unknown; motivo: string }>
}

/** Valida la forma de una entrada del archivo de datos; devuelve el motivo si no sirve. */
export function motivoDeInvalidez(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return 'no es un objeto'
  const c = e as Record<string, unknown>
  if (typeof c.id !== 'string' || !c.id) return 'sin id'
  if (c.campo !== 'title' && c.campo !== 'titleEn') return 'campo desconocido'
  if (typeof c.antes !== 'string' || !c.antes.trim()) return 'sin «antes»'
  if (typeof c.ahora !== 'string' || !c.ahora.trim()) return 'sin «ahora»'
  if (c.antes === c.ahora) return '«antes» y «ahora» son iguales'
  if (c.ahora !== c.ahora.trim() || /\s{2,}/.test(c.ahora)) return 'espacios de más en «ahora»'
  if (/[\r\n\t]/.test(c.ahora)) return 'salto de línea o tabulación en «ahora»'
  return null
}

/** Decide qué hacer con cada corrección según lo que la base dice hoy. No escribe nada. */
export function planDeCorrecciones(entradas: unknown[], actuales: TitulosActuales): PlanDeCorrecciones {
  const plan: PlanDeCorrecciones = { aplicar: [], yaAplicadas: [], cambiaron: [], noExisten: [], invalidas: [] }
  const vistos = new Set<string>()
  for (const entrada of entradas) {
    const motivo = motivoDeInvalidez(entrada)
    if (motivo) { plan.invalidas.push({ entrada, motivo }); continue }
    const c = entrada as CorreccionDeTitulo
    const clave = `${c.id}:${c.campo}`
    if (vistos.has(clave)) { plan.invalidas.push({ entrada, motivo: 'repetida: dos correcciones para el mismo campo' }); continue }
    vistos.add(clave)
    const fila = actuales.get(c.id)
    if (!fila) { plan.noExisten.push(c); continue }
    const actual = fila[c.campo]
    if (actual === c.ahora) plan.yaAplicadas.push(c)
    else if (actual === c.antes) plan.aplicar.push(c)
    else plan.cambiaron.push({ ...c, actual })
  }
  return plan
}
