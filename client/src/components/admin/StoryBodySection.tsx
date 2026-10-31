import { useEffect, useState } from 'react'
import type { Story, StoryBodyAdmin, StoryBodyAviso } from '@shared/types'
import { adminApi } from '../../lib/admin-api'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'

/**
 * La nota con claves en la ficha del panel (plan del 25-oct-2026, B2 y B4).
 *
 * Nace sola al publicar, con método «redactada por el modelo, sin revisión»,
 * y la ficha pública lo dice así. Acá el editor la lee, corrige lo que haga
 * falta y la da por revisada con su nombre: entonces el recuadro público pasa
 * a decir que una persona la leyó y aprobó. Lo que se guarda vuelve a pasar
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
  ia_sin_revision: 'Redactada por el modelo, sin revisión',
  ia_revisada: 'Redactada por el modelo y revisada',
  humana: 'Escrita por una persona',
}

interface Props {
  story: Pick<Story, 'id' | 'slug'>
}

export function StoryBodySection({ story }: Props) {
  const [body, setBody] = useState<StoryBodyAdmin | null | undefined>(undefined)
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
        setRevisor(body?.reviewedBy ?? '')
      })
      .catch((e: Error) => vivo && setError(e.message))
      .finally(() => vivo && setOcupado(null))
    return () => { vivo = false }
  }, [story.id])

  const cambiado = body ? CAMPOS.some((c) => borrador[c.clave] !== body[c.clave]) || revisor !== body.reviewedBy : false

  const redactar = async () => {
    setOcupado('redactando'); setError(null)
    try {
      const r = await adminApi.stories.draftBody(story.id)
      setBody(r.body)
      setBorrador(Object.fromEntries(CAMPOS.map((c) => [c.clave, r.body[c.clave]])))
      setRevisor('')
      setAvisos(r.avisos)
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

      {avisos.length > 0 && (
        <ul className="mt-3 text-xs text-amber-800 list-disc pl-5 space-y-1" role="status">
          {avisos.map((a, i) => <li key={i}><strong>{a.campo}:</strong> {a.mensaje}</li>)}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  )
}
