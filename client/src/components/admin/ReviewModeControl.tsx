import { useState } from 'react'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useToast } from '../ui/Toast'
import { useReviewModePreview, useSetReviewMode } from '../../hooks/useReviews'
import { ApiError, type ReviewMode, type ReviewStats } from '../../lib/admin-api'
import { MODE_LABEL } from '../../lib/review-labels'

interface ReviewModeControlProps {
  slug: string
  stats: ReviewStats
  isAdmin: boolean
}

const MODOS: ReviewMode[] = ['off', 'shadow', 'enforce']

/**
 * La franja del modo: siempre visible, con lo que hoy se ve y lo que se vería
 * al aplicar. Cambiar el modo es solo de administradores y pasa por una vista
 * previa con el número exacto de notas que se ocultarían.
 */
export function ReviewModeControl({ slug, stats, isAdmin }: ReviewModeControlProps) {
  const { toast } = useToast()
  const [elegido, setElegido] = useState<ReviewMode | null>(null)
  const preview = useReviewModePreview(slug, elegido)
  const setMode = useSetReviewMode(slug)

  const franja =
    stats.effectiveMode === 'enforce'
      ? { clase: 'border-red-200 bg-red-50 text-red-900', texto: `Modo aplicar · lo pendiente está oculto en /comunidad/${slug} hasta que lo liberes.` }
      : stats.effectiveMode === 'shadow'
        ? { clase: 'border-amber-200 bg-amber-50 text-amber-900', texto: `Modo sombra · lo pendiente sigue visible en /comunidad/${slug} · solo se oculta lo que retengas.` }
        : { clase: 'border-neutral-200 bg-neutral-50 text-neutral-700', texto: 'Apagado · esta marca muestra todo, como siempre.' }

  const degradado = stats.mode === 'enforce' && stats.effectiveMode === 'shadow'

  const confirmar = () => {
    if (!elegido) return
    setMode.mutate(elegido, {
      onSuccess: (r) => {
        toast('success', `${MODE_LABEL[r.to]}: se ocultan ${r.preview.hidden} notas`)
        setElegido(null)
      },
      onError: (err) => {
        toast('error', err instanceof ApiError ? err.message : 'No se pudo cambiar el modo')
        setElegido(null)
      },
    })
  }

  return (
    <div className={`rounded-lg border px-4 py-3 ${franja.clase}`} role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium">
          {franja.texto}
          {degradado && (
            <span className="ml-1 font-normal">
              (configurado «aplicar», pero el modo aprendizaje lo degrada a sombra)
            </span>
          )}
          {stats.learningMode && stats.effectiveMode !== 'off' && (
            <span className="ml-1 font-normal">Modo aprendizaje encendido: el gate retiene todo lo nuevo.</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span>
            Hoy se ven <strong>{stats.visibleToday}</strong> · si aplicaras, <strong>{stats.visibleIfEnforced}</strong>
          </span>
          {isAdmin && (
            <Select
              aria-label="Cambiar el modo"
              value={stats.mode}
              onChange={(e) => {
                const m = e.target.value as ReviewMode
                if (m !== stats.mode) setElegido(m)
              }}
              options={MODOS.map((m) => ({
                value: m,
                label: MODE_LABEL[m],
                disabled: m === 'enforce' && stats.learningMode,
              }))}
              className="w-36"
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!elegido}
        onClose={() => setElegido(null)}
        onConfirm={confirmar}
        title={elegido ? `Pasar a «${MODE_LABEL[elegido]}»` : ''}
        description={
          preview.data
            ? preview.data.hidden > 0
              ? `Hoy se ven ${preview.data.visibleNow} notas; con este modo se verían ${preview.data.visibleAfter}. Se ocultan ${preview.data.hidden}.`
              : preview.data.hidden < 0
                ? `Hoy se ven ${preview.data.visibleNow} notas; con este modo se verían ${preview.data.visibleAfter}. Aparecen ${-preview.data.hidden}.`
                : `No cambia lo que se ve: ${preview.data.visibleNow} notas antes y después.`
            : 'Calculando cuántas notas cambian…'
        }
        confirmLabel={elegido ? MODE_LABEL[elegido] : 'Confirmar'}
        variant={elegido === 'enforce' ? 'danger' : 'primary'}
        loading={setMode.isPending || preview.isLoading}
      />
    </div>
  )
}

export function BotonRefrescar({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} loading={loading}>Actualizar</Button>
  )
}
