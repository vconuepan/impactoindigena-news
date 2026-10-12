import type { LearningExitCriteria } from '../../lib/admin-api'

interface LearningExitPanelProps {
  criteria: LearningExitCriteria
}

/** Fecha corta en hora de Chile: «18 oct». */
function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' })
}

function Condicion({ ok, titulo, detalle }: { ok: boolean; titulo: string; detalle: string }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className={`mt-0.5 font-semibold ${ok ? 'text-emerald-700' : 'text-neutral-400'}`}>{ok ? '✓' : '○'}</span>
      <span>
        <span className="sr-only">{ok ? 'Se cumple: ' : 'Todavía no: '}</span>
        <span className="font-medium text-neutral-800">{titulo}</span>
        <span className="text-neutral-600"> · {detalle}</span>
      </span>
    </li>
  )
}

/**
 * Cuándo se puede apagar el modo aprendizaje. Decisión del director del
 * 11-oct-2026, «ambos»: por fecha (dos semanas en revisión) Y con datos (una
 * semana con la cola al día y el editor liberando al menos 9 de cada 10 notas de
 * puntaje 0, que son las que el gate dejaría pasar solo). Informa, no bloquea:
 * el aprendizaje se apaga en Azure, no desde esta pantalla.
 */
export function LearningExitPanel({ criteria: c }: LearningExitPanelProps) {
  const { minDays, windowDays, score0ReleaseRatio, score0MinDecisions, queueAlertHours } = c.thresholds
  const deCadaDiez = Math.round(score0ReleaseRatio * 10)

  const cola = c.queueCurrentSince
    ? `al día desde el ${fecha(c.queueCurrentSince)}: ${c.queueCurrentDays} de ${windowDays} días`
    : `hoy hay notas esperando más de ${queueAlertHours} h`

  const faltan = Math.max(0, score0MinDecisions - c.score0Decided)
  const puntaje0 =
    `${c.score0Released} ${c.score0Released === 1 ? 'liberada' : 'liberadas'} de ${c.score0Decided} ${c.score0Decided === 1 ? 'decidida' : 'decididas'} en los últimos ${windowDays} días` +
    (faltan === 1 ? ' · falta 1 decisión para medir' : faltan > 1 ? ` · faltan ${faltan} decisiones para medir` : '')

  return (
    <section aria-label="Criterio para apagar el modo aprendizaje" className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-neutral-900">Para apagar el modo aprendizaje</h2>
        <span className={`text-xs font-semibold ${c.met ? 'text-emerald-700' : 'text-neutral-500'}`}>
          {c.met ? 'Se cumple: ya se puede apagar' : 'Todavía no se cumple'}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        <Condicion
          ok={c.dateMet}
          titulo={`${minDays} días en revisión`}
          detalle={c.earliestOffAt ? `desde el ${fecha(c.reviewSince)}; se cumple el ${fecha(c.earliestOffAt)}` : 'la marca todavía no tiene notas registradas'}
        />
        <Condicion ok={c.queueMet} titulo={`${windowDays} días con la cola al día (nada espera más de ${queueAlertHours} h)`} detalle={cola} />
        <Condicion ok={c.score0Met} titulo={`Liberas al menos ${deCadaDiez} de cada 10 notas de puntaje 0`} detalle={puntaje0} />
      </ul>
      <p className="mt-2 text-xs text-neutral-500">
        Las tres a la vez. El aprendizaje se apaga en Azure (GATE_LEARNING_MODE=false); esta pantalla no lo apaga ni lo bloquea.
      </p>
    </section>
  )
}
