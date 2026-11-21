import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { puntuar, type Categoria } from '../lib/puntajeLector.js'
import { EDICION_REDES } from '../lib/redNube.js'

/**
 * «Lectores probables» para el panel: aplica el puntaje (lib/puntajeLector.ts) a
 * cada visitante-dia que tiene señales y agrega por categoria, pais,
 * dispositivo, origen y red. Desde el 21-nov-2026.
 *
 * Solo cuentan los visitantes-dia con señales (los que llegaron despues de que
 * se aplico el SQL de las columnas). Los anteriores no se pueden puntuar: no hay
 * con que. No se borran ni se reescriben; el panel los muestra aparte.
 */

export interface FilaSenales {
  country: string
  device: string
  interacted: boolean
  pages: number
  saw_story: boolean
  saw_search: boolean
  saw_other: boolean
  source_first: string
  lang: string
  net: string
}

export interface Cuenta { bruto: number; lector: number; dudoso: number; bot: number }

export interface LectoresProbables {
  activo: boolean
  desde: string | null
  /** Visitantes-dia en la ventana, con o sin señales. */
  visitantes: number
  conSenales: number
  total: Cuenta
  porPais: Array<{ clave: string } & Cuenta>
  porDispositivo: Array<{ clave: string } & Cuenta>
  porOrigen: Array<{ clave: string } & Cuenta>
  porRed: Array<{ clave: string } & Cuenta>
  /** Motivos que mas restaron entre dudosos y probables bots. */
  motivosEnContra: Array<{ motivo: string; veces: number }>
  edicionRedes: string
}

const vacia = (): Cuenta => ({ bruto: 0, lector: 0, dudoso: 0, bot: 0 })

function sumar(mapa: Map<string, Cuenta>, clave: string, cat: Categoria) {
  const c = mapa.get(clave) ?? vacia()
  c.bruto++
  c[cat]++
  mapa.set(clave, c)
}

const ordenar = (m: Map<string, Cuenta>, n: number) =>
  [...m.entries()].map(([clave, c]) => ({ clave, ...c })).sort((a, b) => b.bruto - a.bruto).slice(0, n)

/** Agregacion pura, separada de la consulta para poder probarla. */
export function agregar(filas: FilaSenales[]): Omit<LectoresProbables, 'activo' | 'desde' | 'visitantes' | 'edicionRedes'> {
  const total = vacia()
  const pais = new Map<string, Cuenta>()
  const disp = new Map<string, Cuenta>()
  const origen = new Map<string, Cuenta>()
  const red = new Map<string, Cuenta>()
  const enContra = new Map<string, number>()

  for (const f of filas) {
    const r = puntuar({
      interactuo: f.interacted,
      nube: f.net,
      origen: f.source_first,
      idioma: f.lang === 'coherente' || f.lang === 'incoherente' ? f.lang : 'sin_dato',
      dispositivo: f.device,
      paginas: f.pages,
      vioFicha: f.saw_story,
      vioBusqueda: f.saw_search,
      vioOtra: f.saw_other,
    })
    total.bruto++
    total[r.categoria]++
    sumar(pais, f.country, r.categoria)
    sumar(disp, f.device, r.categoria)
    sumar(origen, f.source_first || 'direct', r.categoria)
    sumar(red, f.net || 'Red que no es de nube', r.categoria)
    if (r.categoria !== 'lector') {
      for (const m of r.motivos) {
        if (!m.startsWith('−')) continue
        // El proveedor va aparte, en «porRed»: aqui se agrupa el motivo.
        const clave = m.replace(/^(−\d+ red de nube) \(.*\)$/, '$1')
        enContra.set(clave, (enContra.get(clave) ?? 0) + 1)
      }
    }
  }

  return {
    conSenales: filas.length,
    total,
    porPais: ordenar(pais, 12),
    porDispositivo: ordenar(disp, 5),
    porOrigen: ordenar(origen, 8),
    porRed: ordenar(red, 10),
    motivosEnContra: [...enContra.entries()].map(([motivo, veces]) => ({ motivo, veces })).sort((a, b) => b.veces - a.veces).slice(0, 8),
  }
}

function sinDatos(activo: boolean, visitantes = 0): LectoresProbables {
  return {
    activo, desde: null, visitantes, conSenales: 0, total: vacia(),
    porPais: [], porDispositivo: [], porOrigen: [], porRed: [], motivosEnContra: [], edicionRedes: EDICION_REDES,
  }
}

export async function lectoresProbables(since: Date): Promise<LectoresProbables> {
  if (!config.analytics.botScoring) return sinDatos(false)
  try {
    const [primero] = await prisma.$queryRaw<Array<{ d: Date | null }>>`
      SELECT MIN(date) AS d FROM visitor_day_signals WHERE date >= ${since} AND pages > 0
    `
    if (!primero?.d) return sinDatos(true)
    const desde = primero.d > since ? primero.d : since
    const [filas, [visitantes]] = await Promise.all([
      prisma.$queryRaw<FilaSenales[]>`
        SELECT d.country, d.device, s.interacted, s.pages, s.saw_story, s.saw_search, s.saw_other,
               s.source_first, s.lang, s.net
        FROM daily_visitors d
        JOIN visitor_day_signals s ON s.date = d.date AND s.visitor_hash = d.visitor_hash
        WHERE d.date >= ${desde} AND s.pages > 0
      `,
      prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM daily_visitors WHERE date >= ${desde}`,
    ])
    return {
      activo: true,
      desde: desde.toISOString().slice(0, 10),
      visitantes: Number(visitantes?.n ?? 0),
      edicionRedes: EDICION_REDES,
      ...agregar(filas.map((f) => ({ ...f, pages: Number(f.pages) }))),
    }
  } catch {
    // Sin el SQL del 21-nov las columnas no existen: el panel dice «sin datos».
    return sinDatos(true)
  }
}
