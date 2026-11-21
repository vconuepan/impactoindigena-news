import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { countryName } from '../../lib/countryName'
import type { adminApi } from '../../lib/admin-api'
import {
  ETIQUETA_CATEGORIA, ETIQUETA_ORIGEN, csvLectores, porcentaje, rangoLectores,
  type CategoriaLector, type Cuenta,
} from './analyticsSenales'

/**
 * El puntaje «lector probable» en el panel (pasos 4 y 5 de
 * docs/propuesta-analytics-bots.md, 21-nov-2026). Todo aqui es una ESTIMACION
 * por señales y lo dice en pantalla; las cifras brutas de siempre no cambian.
 */

type Readers = NonNullable<Awaited<ReturnType<typeof adminApi.analytics.overview>>['readers']>

const DEVICE: Record<string, string> = { mobile: 'Móvil', tablet: 'Tablet', desktop: 'Escritorio' }

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

const fmt = (n: number) => n.toLocaleString('es-CL')

/** Encabezado: lectores probables con su rango, al lado del tráfico bruto. */
export function EncabezadoLectores({ readers }: { readers: Readers | undefined }) {
  if (!readers || !readers.activo) {
    return readers && !readers.activo ? (
      <p className="text-xs text-neutral-500">
        El puntaje de lectores probables está apagado (<code>ANALYTICS_BOT_SCORING=off</code>). Las cifras de abajo son brutas.
      </p>
    ) : null
  }
  if (!readers.desde) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Lectores probables</p>
        <p className="text-sm text-neutral-500">
          Sin datos aún. Empieza a medir cuando se aplica el SQL
          <code className="mx-1 text-xs">20261121000000_visitor_day_signals_puntaje</code>
          y el código está desplegado.
        </p>
      </div>
    )
  }
  const r = rangoLectores(readers.total)
  const sinSenales = Math.max(0, readers.visitantes - readers.conSenales)
  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
            Lectores probables · desde el {fechaCorta(readers.desde)}
          </p>
          <p className="text-3xl font-bold text-brand-800 tabular-nums">
            {fmt(r.probable)}{' '}
            <span className="text-base font-medium text-neutral-500">
              (rango {fmt(r.piso)}–{fmt(r.techo)})
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Tráfico bruto, misma ventana</p>
          <p className="text-3xl font-bold text-neutral-700 tabular-nums">{fmt(readers.visitantes)}</p>
        </div>
        <div className="text-sm text-neutral-600">
          {porcentaje(r.probable, readers.conSenales)} % de los visitantes-día con señales
        </div>
      </div>
      <p className="text-xs text-neutral-500 mt-3">
        Es una estimación, no un conteo de personas. «Lector probable» = puntaje de 70 o más; el rango suma los dudosos
        (30 a 69). Se cuenta por visitante-día, sin cookies.
        {sinSenales > 0 && ` ${fmt(sinSenales)} visitantes-día de la ventana no tienen señales y no se puntúan.`}
      </p>
    </div>
  )
}

type Seleccion = 'todos' | CategoriaLector

function Tabla({ titulo, filas, nombre, sel }: {
  titulo: string
  filas: Array<{ clave: string } & Cuenta>
  nombre: (clave: string) => string
  sel: Seleccion
}) {
  if (filas.length === 0) return null
  const cats: CategoriaLector[] = sel === 'todos' ? ['lector', 'dudoso', 'bot'] : [sel]
  return (
    <Card title={titulo}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
            <th className="py-1.5 font-medium" />
            <th className="py-1.5 font-medium text-right">Bruto</th>
            {cats.map((c) => <th key={c} className="py-1.5 font-medium text-right">{ETIQUETA_CATEGORIA[c]}</th>)}
            <th className="py-1.5 font-medium text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className="border-b border-neutral-100">
              <td className="py-1.5 text-neutral-700 truncate max-w-[12rem]">{nombre(f.clave)}</td>
              <td className="py-1.5 text-right tabular-nums text-neutral-600">{fmt(f.bruto)}</td>
              {cats.map((c) => <td key={c} className="py-1.5 text-right tabular-nums text-neutral-600">{fmt(f[c])}</td>)}
              <td className="py-1.5 text-right tabular-nums text-neutral-600">
                {porcentaje(f[sel === 'todos' ? 'lector' : sel], f.bruto)} %
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

const OPCIONES: Array<{ valor: Seleccion; etiqueta: string }> = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'lector', etiqueta: 'Lectores probables' },
  { valor: 'dudoso', etiqueta: 'Dudosos' },
  { valor: 'bot', etiqueta: 'Probables bots' },
]

/** Desglose por país, dispositivo, origen y red, con selector y CSV. */
export function DetalleLectores({ readers }: { readers: Readers | undefined }) {
  const [sel, setSel] = useState<Seleccion>('todos')
  if (!readers?.activo || !readers.desde) return null
  const desde = readers.desde

  const tablas = [
    { titulo: 'País', filas: readers.porPais, nombre: countryName },
    { titulo: 'Dispositivo', filas: readers.porDispositivo, nombre: (k: string) => DEVICE[k] ?? k },
    { titulo: 'Origen de la primera visita', filas: readers.porOrigen, nombre: (k: string) => ETIQUETA_ORIGEN[k] ?? k },
    { titulo: 'Red', filas: readers.porRed, nombre: (k: string) => k },
  ]

  const descargar = () => {
    const csv = csvLectores(desde, tablas)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `lectores-probables-desde-${desde}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-labelledby="titulo-lectores" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-lectores" className="text-sm font-semibold text-neutral-700">
          Quién es quién, por visitante-día
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-neutral-100 rounded-lg p-1" role="group" aria-label="Filtrar por categoría">
            {OPCIONES.map((o) => (
              <button
                key={o.valor}
                type="button"
                aria-pressed={sel === o.valor}
                onClick={() => setSel(o.valor)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  sel === o.valor ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={descargar}
            className="px-3 py-1.5 text-sm rounded-md font-medium border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {tablas.map((t) => <Tabla key={t.titulo} {...t} sel={sel} />)}
      </div>

      {readers.motivosEnContra.length > 0 && (
        <Card title="Lo que más resta puntos (dudosos y probables bots)">
          <ul className="space-y-1">
            {readers.motivosEnContra.map((m) => (
              <li key={m.motivo} className="flex justify-between gap-3 text-sm">
                <span className="text-neutral-700">{m.motivo}</span>
                <span className="tabular-nums text-neutral-600">{fmt(m.veces)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-neutral-500">
        Las páginas más vistas no se pueden separar por categoría: cada vista se cuenta sin saber de qué visitante es,
        a propósito, para que nadie quede seguido por el sitio. Redes de nube según{' '}
        <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-700">
          IP Geolocation by DB-IP
        </a>{' '}
        (edición {readers.edicionRedes}, licencia CC BY 4.0).
      </p>
    </section>
  )
}
