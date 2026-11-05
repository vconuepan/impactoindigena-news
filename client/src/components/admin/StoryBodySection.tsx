import { useEffect, useState } from 'react'
import type { Story, StoryBodyAdmin, StoryBodyAviso, StoryBodyPunto, StoryBodyVerificacion } from '@shared/types'
import { adminApi } from '../../lib/admin-api'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'

/**
 * La nota con claves en la ficha del panel (plan del 25-oct-2026, B2 y B4).
 *
 * Nace sola al publicar, con método «redactada por el modelo, sin revisión»,
 * y desde el 3-nov-2026 (decisión C7 del director) la ficha pública no la
 * muestra: sale con el resumen. Acá el editor la lee, corrige lo que haga
 * falta y la da por revisada con su nombre: recién entonces se publica, y el
 * recuadro público dice que una persona la leyó y aprobó. Lo que se guarda vuelve a pasar
 * por los mismos candados que al redactar; lo que bloquea no se guarda.
 */

const CAMPOS: { clave: keyof Pick<StoryBodyAdmin, 'bajada' | 'quePaso' | 'porQueImporta' | 'contexto' | 'queSigue'>; etiqueta: string; filas: number }[] = [
  { clave: 'bajada', etiqueta: 'Bajada', filas: 2 },
  { clave: 'quePaso', etiqueta: 'Qué pasó', filas: 5 },
  { clave: 'porQueImporta', etiqueta: 'Por qué importa a los pueblos', filas: 4 },
  { clave: 'contexto', etiqueta: 'Contexto', filas: 4 },
  { clave: 'queSigue', etiqueta: 'Qué sigue', filas: 3 },
]

const METODO: Record<StoryBodyAdmin['method'], string> = {
  ia_sin_revision: 'Redactada por el modelo, sin revisión: no se publica hasta revisarla',
  ia_revisada: 'Redactada por el modelo y revisada',
  humana: 'Escrita por una persona',
}

interface Props {
  story: Pick<Story, 'id' | 'slug'>
}

const REVISOR_KEY = 'voces.admin.revisorNota'

/** El nombre de quien revisa se recuerda en este navegador, para aprobar de un clic. Es solo comodidad: si el almacenamiento no está, se escribe cada vez. */
function revisorRecordado(): string {
  try { return window.localStorage.getItem(REVISOR_KEY) ?? '' } catch { return '' }
}
function recordarRevisor(nombre: string) {
  try { window.localStorage.setItem(REVISOR_KEY, nombre) } catch { /* sin almacenamiento: no pasa nada */ }
}

const ETIQUETA_CAMPO: Record<StoryBodyPunto['campo'], string> = {
  bajada: 'bajada', quePaso: 'qué pasó', porQueImporta: 'por qué importa', contexto: 'contexto', queSigue: 'qué sigue',
}

/** La frase del original con el valor en negrita, si aparece tal cual. */
function Resaltado({ texto, valor }: { texto: string; valor: string }) {
  const i = texto.toLowerCase().indexOf(valor.toLowerCase())
  if (i < 0) return <>{texto}</>
  return <>{texto.slice(0, i)}<mark className="bg-amber-100 text-neutral-900">{texto.slice(i, i + valor.length)}</mark>{texto.slice(i + valor.length)}</>
}

/**
 * Cada cifra y cada nombre de la nota junto a la frase del original donde
 * aparece. Los errores de hecho medidos el 2-nov-2026 (Osage, Nepal) traían
 * cifras que sí estaban en el artículo, pero dichas de otra cosa: lo que los
 * atrapa es leer la cifra en su frase. Lo que no aparece va primero y en rojo.
 */
function PuntosParaCotejar({ verificacion }: { verificacion: StoryBodyVerificacion }) {
  const { puntos, original } = verificacion
  const sinRespaldo = puntos.filter((p) => !p.enOriginal).length
  return (
    <div className="mt-4 space-y-3">
      <details open>
        <summary className="cursor-pointer text-xs font-semibold text-neutral-700 select-none">
          Para cotejar con el original ({puntos.length}{sinRespaldo > 0 ? `, ${sinRespaldo} sin respaldo` : ''})
        </summary>
        {puntos.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-500">La nota no trae cifras ni nombres propios.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {puntos.map((p) => (
              <li key={`${p.tipo}-${p.valor}`} className="text-xs leading-snug border-l-2 pl-2" style={{ borderColor: p.enOriginal ? '#d4d4d4' : '#b91c1c' }}>
                <span className="font-semibold text-neutral-800">{p.valor}</span>
                <span className="text-neutral-500"> · {p.tipo === 'cifra' ? 'cifra' : 'nombre'} en {ETIQUETA_CAMPO[p.campo]}</span>
                {p.enOriginal ? (
                  p.contextos.map((c, i) => <p key={i} className="mt-0.5 text-neutral-600"><Resaltado texto={c} valor={p.valor} /></p>)
                ) : (
                  <p className="mt-0.5 text-red-700">No aparece igual en el original: confirma de dónde sale.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-neutral-700 select-none">Artículo original</summary>
        <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700">
          {original || 'No hay texto guardado del original.'}
        </div>
      </details>
    </div>
  )
}

export function StoryBodySection({ story }: Props) {
  const [body, setBody] = useState<StoryBodyAdmin | null | undefined>(undefined)
  const [verificacion, setVerificacion] = useState<StoryBodyVerificacion | null>(null)
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [revisor, setRevisor] = useState('')
  const [avisos, setAvisos] = useState<StoryBodyAviso[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<'cargando' | 'redactando' | 'guardando' | null>('cargando')

  useEffect(() => {
    let vivo = true
    adminApi.stories
      .body(story.id)
      .then(({ body }) => {
        if (!vivo) return
        setBody(body)
        setBorrador(body ? Object.fromEntries(CAMPOS.map((c) => [c.clave, body[c.clave]])) : {})
        // Una nota sin revisar trae el nombre recordado de la última vez: aprobar es un clic.
        setRevisor(body ? (body.reviewedBy || revisorRecordado()) : '')
        if (body) cargarVerificacion(() => vivo)
      })
      .catch((e: Error) => vivo && setError(e.message))
      .finally(() => vivo && setOcupado(null))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id])

  // Si no carga, la revisión sigue siendo posible: el panel de cotejo es ayuda, no requisito.
  const cargarVerificacion = (sigueVivo: () => boolean = () => true) => {
    adminApi.stories
      .bodyVerificacion(story.id)
      .then((v) => { if (sigueVivo()) setVerificacion(v) })
      .catch(() => { if (sigueVivo()) setVerificacion(null) })
  }

  const cambiado = body ? CAMPOS.some((c) => borrador[c.clave] !== body[c.clave]) || revisor !== body.reviewedBy : false

  const redactar = async () => {
    setOcupado('redactando'); setError(null)
    try {
      const r = await adminApi.stories.draftBody(story.id)
      setBody(r.body)
      setBorrador(Object.fromEntries(CAMPOS.map((c) => [c.clave, r.body[c.clave]])))
      setRevisor('')
      setAvisos(r.avisos)
      cargarVerificacion()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo redactar')
    } finally {
      setOcupado(null)
    }
  }

  const guardar = async (darPorRevisada: boolean) => {
    if (!body) return
    setOcupado('guardando'); setError(null)
    try {
      const cambios: Record<string, string> = {}
      for (const c of CAMPOS) if (borrador[c.clave] !== body[c.clave]) cambios[c.clave] = borrador[c.clave]
      if (darPorRevisada || revisor !== body.reviewedBy) cambios.reviewedBy = revisor.trim()
      const r = await adminApi.stories.updateBody(story.id, cambios)
      setBody(r.body)
      setAvisos(r.avisos)
      if (darPorRevisada && revisor.trim()) recordarRevisor(revisor.trim())
      cargarVerificacion()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <section className="border-t border-neutral-200 mt-8 pt-6" aria-labelledby="nota-claves">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 id="nota-claves" className="text-sm font-semibold text-neutral-800">Nota con claves</h3>
        {body && (
          <span className="text-xs text-neutral-500">
            {METODO[body.method]}{body.reviewedBy ? ` por ${body.reviewedBy}` : ''} · {body.model} · {body.inputTokens + body.outputTokens} tokens
          </span>
        )}
      </div>

      {ocupado === 'cargando' && <p className="text-sm text-neutral-500">Cargando…</p>}

      {body === null && ocupado !== 'cargando' && (
        <div className="text-sm text-neutral-600 space-y-2">
          <p>Esta noticia no tiene nota con claves: un candado la bloqueó, el original era muy corto o es anterior al 30-oct-2026. La ficha muestra el resumen.</p>
          <Button variant="secondary" onClick={redactar} disabled={ocupado !== null}>
            {ocupado === 'redactando' ? 'Redactando…' : 'Redactar desde el artículo original'}
          </Button>
        </div>
      )}

      {body && (
        <div className="space-y-3">
          {CAMPOS.map((c) => (
            <div key={c.clave}>
              <label htmlFor={`body-${c.clave}`} className="block text-xs font-semibold text-neutral-700 mb-1">{c.etiqueta}</label>
              <Textarea
                id={`body-${c.clave}`}
                rows={c.filas}
                value={borrador[c.clave] ?? ''}
                onChange={(e) => setBorrador({ ...borrador, [c.clave]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label htmlFor="body-revisor" className="block text-xs font-semibold text-neutral-700 mb-1">Revisada por</label>
            <input
              id="body-revisor"
              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={revisor}
              onChange={(e) => setRevisor(e.target.value)}
              placeholder="Tu nombre, si la leíste y la apruebas"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => guardar(false)} disabled={ocupado !== null || !cambiado}>
              {ocupado === 'guardando' ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => guardar(true)}
              disabled={ocupado !== null || !revisor.trim()}
              title={!revisor.trim() ? 'Escribe tu nombre en «Revisada por»' : undefined}
            >
              Dar por revisada
            </Button>
            <Button variant="secondary" onClick={redactar} disabled={ocupado !== null}>
              {ocupado === 'redactando' ? 'Redactando…' : 'Volver a redactar desde el original'}
            </Button>
          </div>
        </div>
      )}

      {body && verificacion && <PuntosParaCotejar verificacion={verificacion} />}

      {avisos.length > 0 && (
        <ul className="mt-3 text-xs text-amber-800 list-disc pl-5 space-y-1" role="status">
          {avisos.map((a, i) => <li key={i}><strong>{a.campo}:</strong> {a.mensaje}</li>)}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  )
}
