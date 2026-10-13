import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Select'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../lib/auth'
import { useBrandPanels, useBrandSelections, useSetBrandMode } from '../../hooks/useBrand'
import { ApiError, type BrandPanel, type ReviewMode } from '../../lib/admin-api'
import { MODE_LABEL } from '../../lib/review-labels'
import { CRITERIO_LABEL, EJE_LABEL, LUGAR_LABEL, ESTADO_MARCA_LABEL, ORIGEN_MARCA_LABEL, banderaLabel } from '../../lib/brand-labels'

const MODOS: ReviewMode[] = ['off', 'shadow', 'enforce']

type Cambio = { slug: string; campo: 'mode' | 'rescueMode'; a: ReviewMode }

/**
 * «Criterio por marca» (D5, entrega 2, ítem 11): el estado de cada marca, lo de
 * hoy, la vista previa «si encendieras» y el interruptor. Cambiar el modo es solo
 * de administradores; el servidor se niega sin pautas, a aplicar sin D4, y al
 * rescate de una marca territorial. Las nueve métricas de la sombra viven en el
 * script de otras-voces.
 */
export default function BrandPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { data, isLoading, isError, refetch } = useBrandPanels()

  return (
    <>
      <Helmet>
        <title>Criterio por marca · Admin</title>
      </Helmet>
      <PageHeader
        title="Criterio por marca"
        description="Lo que el carril de cada marca juzga, elige y publicaría. En sombra nada se publica; en aplicar, lo elegido entra a la vertical y pasa por la revisión por marca."
      />
      {isLoading && <LoadingSpinner />}
      {isError && <ErrorState message="No se pudo cargar el criterio por marca" onRetry={() => refetch()} />}
      {data && data.data.length === 0 && <EmptyState title="Ninguna vertical tiene criterio de marca" description="La migración de D5 siembra Voces Araucanía y Voces Mapuche." />}
      {data && !data.enabled && (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700" role="status">
          El carril está apagado en el servidor (D5_ENABLED): ninguna marca juzga ni elige, cualquiera sea su modo.
        </div>
      )}
      <div className="space-y-6">
        {data?.data.map((p) => <PanelDeMarca key={p.slug} panel={p} isAdmin={isAdmin} learningMode={data.learningMode} />)}
      </div>
    </>
  )
}

function PanelDeMarca({ panel: p, isAdmin, learningMode }: { panel: BrandPanel; isAdmin: boolean; learningMode: boolean }) {
  const { toast } = useToast()
  const [cambio, setCambio] = useState<Cambio | null>(null)
  const setMode = useSetBrandMode(p.slug)
  const elegidas = useBrandSelections(p.slug)
  const mapuche = p.criterion === 'escala_mapuche'

  const confirmar = () => {
    if (!cambio) return
    setMode.mutate(
      { [cambio.campo]: cambio.a },
      {
        onSuccess: () => {
          toast('success', `${p.name}: ${cambio.campo === 'mode' ? 'marca' : 'rescate'} en «${MODE_LABEL[cambio.a]}»`)
          setCambio(null)
        },
        onError: (err) => {
          toast('error', err instanceof ApiError ? err.message : 'No se pudo cambiar el modo')
          setCambio(null)
        },
      },
    )
  }

  const descripcion = (c: Cambio) => {
    const s = p.siEncendieras
    if (c.a === 'enforce') {
      const base = `En los últimos ${s.dias} días la marca eligió ${s.elegidas} notas: ${s.visibles} se verían en la vertical y ${s.aLaCola} irían a la revisión por marca.`
      return learningMode ? `${base} Con el modo aprendizaje encendido, todas quedarían pendientes hasta que las liberes.` : base
    }
    if (c.a === 'shadow') return 'En sombra el carril juzga y elige, pero no publica nada ni toca la revisión por marca.'
    return 'Apagada, el carril no juzga ni elige. Lo que ya publicó deja de verse en la vertical.'
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4" aria-labelledby={`marca-${p.slug}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`marca-${p.slug}`} className="text-lg font-semibold text-neutral-900">{p.name}</h2>
          <p className="text-xs text-neutral-500">
            {CRITERIO_LABEL[p.criterion] ?? p.criterion} · pautas v{p.guidelinesVersion}
            {!p.tienePautas && ' (sin cargar)'} · revisión por marca: {MODE_LABEL[p.d4Mode]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <ControlDeModo etiqueta="Marca" valor={p.mode} isAdmin={isAdmin} onElegir={(a) => setCambio({ slug: p.slug, campo: 'mode', a })} />
          {mapuche && <ControlDeModo etiqueta="Rescate" valor={p.rescueMode} isAdmin={isAdmin} onElegir={(a) => setCambio({ slug: p.slug, campo: 'rescueMode', a })} />}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Dato titulo="Llamadas hoy" valor={`${p.hoy.llamadas} de ${p.dailyCallCap}`} />
        <Dato titulo="Juzgadas hoy" valor={p.hoy.juzgadas} />
        <Dato titulo="Elegidas hoy" valor={`${p.hoy.elegidas} (cupo ${p.dailyTarget})`} />
        <Dato titulo="Publicadas hoy" valor={p.hoy.publicadas} />
      </dl>

      <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        Si encendieras: en {p.siEncendieras.dias} días, <strong>{p.siEncendieras.visibles}</strong> notas más en la vertical y{' '}
        <strong>{p.siEncendieras.aLaCola}</strong> a la revisión por marca, de {p.siEncendieras.elegidas} elegidas.
      </p>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">Elegidas en 7 días</h3>
      {elegidas.isLoading && <LoadingSpinner />}
      {elegidas.data && elegidas.data.data.length === 0 && <p className="mt-1 text-sm text-neutral-500">Todavía nada.</p>}
      {elegidas.data && elegidas.data.data.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                <th className="px-2 py-2 font-medium">Nota</th>
                <th className="px-2 py-2 font-medium">Eje</th>
                <th className="px-2 py-2 font-medium">Puntaje</th>
                {mapuche && <th className="px-2 py-2 font-medium">Lugar</th>}
                <th className="px-2 py-2 font-medium">Banderas</th>
                <th className="px-2 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {elegidas.data.data.map((e) => (
                <tr key={e.storyId} className="border-b border-neutral-100">
                  <td className="max-w-md px-2 py-2">
                    <div className="font-medium text-neutral-900">{e.titulo}</div>
                    <div className="text-xs text-neutral-400">
                      {ORIGEN_MARCA_LABEL[e.origen]}
                      {e.fecha && ` · ${new Date(e.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`}
                    </div>
                  </td>
                  <td className="px-2 py-2">{e.eje ? EJE_LABEL[e.eje] ?? e.eje : '—'}</td>
                  <td className="px-2 py-2">{e.nota ?? '—'}</td>
                  {mapuche && <td className="px-2 py-2">{e.lugar ? LUGAR_LABEL[e.lugar] ?? e.lugar : '—'}</td>}
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {e.banderas.length === 0 ? '—' : e.banderas.map((b) => <Badge key={b} variant="orange">{banderaLabel(b)}</Badge>)}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {ESTADO_MARCA_LABEL[e.estado] ?? e.estado}
                    {e.motivo && <span className="text-xs text-neutral-400"> · {e.motivo}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!cambio}
        onClose={() => setCambio(null)}
        onConfirm={confirmar}
        title={cambio ? `${cambio.campo === 'mode' ? 'Marca' : 'Rescate'}: pasar a «${MODE_LABEL[cambio.a]}»` : ''}
        description={cambio ? descripcion(cambio) : ''}
        confirmLabel={cambio ? MODE_LABEL[cambio.a] : 'Confirmar'}
        variant={cambio?.a === 'enforce' ? 'danger' : 'primary'}
        loading={setMode.isPending}
      />
    </section>
  )
}

function ControlDeModo({ etiqueta, valor, isAdmin, onElegir }: { etiqueta: string; valor: ReviewMode; isAdmin: boolean; onElegir: (m: ReviewMode) => void }) {
  if (!isAdmin) {
    return (
      <span>
        {etiqueta}: <Badge variant={valor === 'enforce' ? 'red' : valor === 'shadow' ? 'yellow' : 'gray'}>{MODE_LABEL[valor]}</Badge>
      </span>
    )
  }
  return (
    <label className="flex items-center gap-2">
      <span className="text-neutral-600">{etiqueta}</span>
      <Select
        aria-label={`Cambiar el modo: ${etiqueta.toLowerCase()}`}
        value={valor}
        onChange={(e) => {
          const m = e.target.value as ReviewMode
          if (m !== valor) onElegir(m)
        }}
        options={MODOS.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
        className="w-32"
      />
    </label>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{titulo}</dt>
      <dd className="font-medium text-neutral-900">{valor}</dd>
    </div>
  )
}
