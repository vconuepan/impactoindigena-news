import { EditPanel, PANEL_BODY, PANEL_FOOTER } from './EditPanel'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import type { ReviewQueueItem } from '../../lib/admin-api'
import { formatDateWithTime } from '../../lib/constants'
import { CODE_LABEL, STATE_BADGE, STATE_LABEL, marcaLabel, marcarTerminos, puntajeLabel, razonLabel, terminosDe, textoCorto, terminoVisible } from '../../lib/review-labels'

interface ReviewDetailPanelProps {
  item: ReviewQueueItem | null
  onClose: () => void
  onRelease: (item: ReviewQueueItem) => void
  onHold: (item: ReviewQueueItem) => void
  onReopen: (item: ReviewQueueItem) => void
  pending?: boolean
}

/** El texto con los términos que dispararon resaltados; el resto, tal cual. */
export function Resaltado({ texto, terminos }: { texto: string; terminos: string[] }) {
  return (
    <>
      {marcarTerminos(texto, terminos).map((f, i) =>
        f.marcado ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 text-neutral-900">{f.texto}</mark>
        ) : (
          <span key={i}>{f.texto}</span>
        ),
      )}
    </>
  )
}

export function ReviewDetailPanel({ item, onClose, onRelease, onHold, onReopen, pending }: ReviewDetailPanelProps) {
  const terminos = item ? terminosDe(item.gateReasons, item.gateSignals) : []
  const texto = item ? textoCorto(item.story) : ''
  const titulo = item?.story.title || item?.story.sourceTitle || ''
  const humano = item ? item.reviewState === 'released' || item.reviewState === 'held' : false
  const puntaje = item ? puntajeLabel(item.gateScore) : null

  return (
    <EditPanel open={!!item} onClose={onClose} title={titulo}>
      {item && (
        <>
          <div className={PANEL_BODY}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATE_BADGE[item.reviewState]}>{STATE_LABEL[item.reviewState]}</Badge>
              {puntaje && <Badge variant={puntaje.variant}>Puntaje {puntaje.texto}</Badge>}
              {item.story.narrativeFrame && <Badge variant="gray">Encuadre: {item.story.narrativeFrame}</Badge>}
            </div>

            <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
              <dt className="text-neutral-400">Publicada</dt>
              <dd className="col-span-2 text-neutral-700">{formatDateWithTime(item.story.datePublished)}</dd>
              <dt className="text-neutral-400">Evaluada</dt>
              <dd className="col-span-2 text-neutral-700">{formatDateWithTime(item.gateEvaluatedAt)} · listas {item.gateVersion}</dd>
              <dt className="text-neutral-400">Relevancia</dt>
              <dd className="col-span-2 text-neutral-700">{item.story.relevance ?? '—'}</dd>
            </dl>

            {item.story.summary && (
              <p className="font-serif text-[15px] leading-relaxed text-neutral-800">
                <Resaltado texto={item.story.summary} terminos={terminos} />
              </p>
            )}

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Razones del gate</h4>
              {item.gateReasons.length === 0 ? (
                <p className="mt-1 text-sm text-neutral-500">Ninguna: pasaría sola.</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.gateReasons.map((r) => {
                    const l = razonLabel(r, texto)
                    return <Badge key={r} variant={l.variant}>{l.texto}</Badge>
                  })}
                </div>
              )}
              {item.gateSignals.length > 0 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Señales sin corroborar: {item.gateSignals.map((s) => terminoVisible(s.replace(/^listB:/, ''), texto)).join(', ')}
                </p>
              )}
            </div>

            {item.alsoIn.length > 0 && (
              <p className="text-xs text-neutral-500">
                También en: {item.alsoIn.map((a) => `${marcaLabel(a.slug)} (${STATE_LABEL[a.reviewState].toLowerCase()})`).join(' · ')}
              </p>
            )}

            {humano && (
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <p className="font-medium text-neutral-800">
                  {item.reviewState === 'held' ? 'Retenida' : 'Liberada'}
                  {item.reviewCode && ` · ${CODE_LABEL[item.reviewCode]}`}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {item.reviewedAt ? formatDateWithTime(item.reviewedAt) : ''}
                  {item.reviewedBy && ` · por ${item.reviewedBy}`}
                </p>
                {item.reviewNote && <p className="mt-1 text-neutral-700">{item.reviewNote}</p>}
              </div>
            )}

            {item.story.slug && (
              <a
                href={`/stories/${item.story.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm text-brand-700 underline-offset-2 hover:underline"
              >
                Abrir la nota en Voces Indígenas
              </a>
            )}
          </div>

          <div className={PANEL_FOOTER}>
            {item.reviewState !== 'released' && (
              <Button onClick={() => onRelease(item)} loading={pending}>Liberar</Button>
            )}
            {item.reviewState !== 'held' && (
              <Button variant="danger" onClick={() => onHold(item)} disabled={pending}>Retener</Button>
            )}
            {humano && (
              <Button variant="ghost" onClick={() => onReopen(item)} disabled={pending}>Reabrir</Button>
            )}
            <Button variant="secondary" onClick={onClose} className="ml-auto">Cerrar</Button>
          </div>
        </>
      )}
    </EditPanel>
  )
}
