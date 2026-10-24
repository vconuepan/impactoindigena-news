import { useEffect, useMemo, useState } from 'react'
import type { Story, StoryCarouselAviso, StoryCarouselDraft, StoryCarouselSlide } from '@shared/types'
import { adminApi } from '../../lib/admin-api'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'

/**
 * Carrusel de la noticia, en la ficha del panel.
 *
 * Tres pasos: el texto (lo escribe el modelo desde el ARTICULO ORIGINAL, no
 * desde el resumen de Voces), la vista previa de las láminas y la descarga
 * (imágenes + PDF). El editor corrige el texto entre medio. Nada se guarda en
 * la base ni se publica: el borrador vive en este navegador hasta descargarlo.
 *
 * La descarga solo se habilita con una vista previa del texto actual y sin
 * avisos: el servidor la rechaza igual, pero así el botón no promete algo que
 * no va a entregar.
 */

interface Props {
  story: Pick<Story, 'id' | 'slug'>
}

const CLAVE = (id: string) => `carrusel-borrador:${id}`

function leerBorrador(id: string): StoryCarouselDraft | null {
  try {
    const raw = localStorage.getItem(CLAVE(id))
    return raw ? (JSON.parse(raw) as StoryCarouselDraft) : null
  } catch {
    return null
  }
}

function guardarBorrador(id: string, draft: StoryCarouselDraft | null): void {
  try {
    if (draft) localStorage.setItem(CLAVE(id), JSON.stringify(draft))
    else localStorage.removeItem(CLAVE(id))
  } catch { /* sin almacenamiento: el borrador dura lo que la pestaña */ }
}

function contarPalabras(texto: string): number {
  return texto.trim() ? texto.trim().split(/\s+/).length : 0
}

function nombreDeLamina(i: number, total: number): string {
  if (i === 0) return 'Portada'
  if (i === total - 1) return 'Cierre'
  return `Lámina ${i + 1}`
}

function AvisosDe({ avisos }: { avisos: StoryCarouselAviso[] }) {
  if (avisos.length === 0) return null
  return (
    <ul className="mt-1 space-y-1" role="list">
      {avisos.map((a, i) => (
        <li key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {a.mensaje}
        </li>
      ))}
    </ul>
  )
}

export function StoryCarouselSection({ story }: Props) {
  const [conLectura, setConLectura] = useState(false)
  const [draft, setDraft] = useState<StoryCarouselDraft | null>(() => leerBorrador(story.id))
  const [imagenes, setImagenes] = useState<string[]>([])
  const [avisos, setAvisos] = useState<StoryCarouselAviso[]>(() => leerBorrador(story.id)?.avisos ?? [])
  // El texto que mostró la última vista previa: si cambió, la vista quedó vieja.
  const [vistaDe, setVistaDe] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [previsualizando, setPrevisualizando] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { guardarBorrador(story.id, draft) }, [story.id, draft])

  const cuerpo = useMemo(
    () => (draft ? { laminas: draft.laminas, lectura: draft.lectura } : null),
    [draft],
  )
  const claveActual = cuerpo ? JSON.stringify(cuerpo) : null
  const vistaVigente = vistaDe !== null && vistaDe === claveActual
  const puedeDescargar = vistaVigente && avisos.length === 0 && imagenes.length > 0

  async function generar() {
    setGenerando(true)
    setError(null)
    try {
      const nuevo = await adminApi.stories.carousel(story.id, conLectura)
      setDraft(nuevo)
      setAvisos(nuevo.avisos)
      setImagenes([])
      setVistaDe(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo armar el carrusel')
    } finally {
      setGenerando(false)
    }
  }

  async function previsualizar() {
    if (!cuerpo || !claveActual) return
    setPrevisualizando(true)
    setError(null)
    try {
      const vista = await adminApi.stories.carouselPreview(story.id, cuerpo)
      setImagenes(vista.imagenes)
      setAvisos(vista.avisos)
      setVistaDe(claveActual)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dibujar el carrusel')
    } finally {
      setPrevisualizando(false)
    }
  }

  async function descargar() {
    if (!cuerpo) return
    setDescargando(true)
    setError(null)
    try {
      const blob = await adminApi.stories.carouselDownload(story.id, cuerpo)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carrusel-${story.slug || story.id}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el carrusel')
    } finally {
      setDescargando(false)
    }
  }

  function editarLamina(i: number, campo: keyof StoryCarouselSlide, valor: string) {
    setDraft((d) => d && { ...d, laminas: d.laminas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)) })
  }

  function quitarLamina(i: number) {
    setDraft((d) => d && { ...d, laminas: d.laminas.filter((_, j) => j !== i) })
    setAvisos([])
  }

  function editarLectura(campo: keyof StoryCarouselSlide, valor: string) {
    setDraft((d) => d && d.lectura ? { ...d, lectura: { ...d.lectura, [campo]: valor } } : d)
  }

  function descartar() {
    setDraft(null)
    setAvisos([])
    setImagenes([])
    setVistaDe(null)
    setError(null)
  }

  const total = draft?.laminas.length ?? 0
  const a = draft?.atribucion

  return (
    <div className="border-t border-neutral-200 pt-4" data-testid="seccion-carrusel">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Carrusel</h3>
      <p className="text-sm text-neutral-500 mb-3">
        Se arma desde el artículo original, no desde el resumen de Voces, y cada lámina nombra al medio que reporteó.
        No se publica nada: se descarga para revisarlo y subirlo.
      </p>

      {!draft && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-neutral-300 text-brand-800 focus:ring-brand-500"
              checked={conLectura}
              onChange={(e) => setConLectura(e.target.checked)}
            />
            <span>
              Agregar la lectura de Venancio: una lámina en su voz, marcada con su nombre y sin atribuírsela al medio.
            </span>
          </label>
          <Button type="button" variant="secondary" loading={generando} onClick={generar}>
            Crear carrusel
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>
      )}

      {draft && a && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Reporteó: <span className="font-medium text-neutral-900">{a.medio}</span>
            {a.autor && <> · {a.autor}</>}
            {a.fecha && <> · {a.fecha}</>}
            {' · '}
            <span className="italic">«{a.tituloOriginal}»</span>
          </p>

          {draft.laminas.map((l, i) => {
            const esDesarrollo = i > 0 && i < total - 1
            return (
              <fieldset key={i} className="rounded border border-neutral-200 p-3 space-y-2">
                <legend className="px-1 text-xs font-semibold text-neutral-600">
                  {nombreDeLamina(i, total)}
                </legend>
                <Textarea
                  id={`carrusel-titulo-${i}`}
                  label="Título"
                  rows={2}
                  value={l.titulo}
                  onChange={(e) => editarLamina(i, 'titulo', e.target.value)}
                />
                <Textarea
                  id={`carrusel-texto-${i}`}
                  label={`Texto · ${contarPalabras(l.texto)} palabras`}
                  rows={3}
                  value={l.texto}
                  onChange={(e) => editarLamina(i, 'texto', e.target.value)}
                />
                <AvisosDe avisos={avisos.filter((x) => x.lamina === i)} />
                {esDesarrollo && total > 3 && (
                  <button
                    type="button"
                    onClick={() => quitarLamina(i)}
                    className="text-xs text-neutral-500 hover:text-red-700 underline"
                  >
                    Quitar esta lámina
                  </button>
                )}
              </fieldset>
            )
          })}

          {draft.lectura && (
            <fieldset className="rounded border border-accent-500/40 p-3 space-y-2">
              <legend className="px-1 text-xs font-semibold text-neutral-600">
                La lectura de Venancio Coñuepán Mesías (va antes del cierre)
              </legend>
              <Textarea
                id="carrusel-lectura-titulo"
                label="Título"
                rows={2}
                value={draft.lectura.titulo}
                onChange={(e) => editarLectura('titulo', e.target.value)}
              />
              <Textarea
                id="carrusel-lectura-texto"
                label={`Texto · ${contarPalabras(draft.lectura.texto)} palabras`}
                rows={3}
                value={draft.lectura.texto}
                onChange={(e) => editarLectura('texto', e.target.value)}
              />
              <AvisosDe avisos={avisos.filter((x) => x.lamina === 'lectura')} />
            </fieldset>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" loading={previsualizando} onClick={previsualizar}>
              Ver láminas
            </Button>
            <Button type="button" loading={descargando} disabled={!puedeDescargar} onClick={descargar}>
              Descargar imágenes y PDF
            </Button>
            <Button type="button" variant="ghost" onClick={descartar}>
              Descartar borrador
            </Button>
          </div>
          {!puedeDescargar && (
            <p className="text-xs text-neutral-500">
              {avisos.length > 0
                ? 'Corrige los avisos y vuelve a ver las láminas para descargar.'
                : 'Mira las láminas del texto actual para habilitar la descarga.'}
            </p>
          )}

          {imagenes.length > 0 && (
            <div className="grid grid-cols-2 gap-2" aria-label="Vista previa del carrusel">
              {imagenes.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Lámina ${i + 1} de ${imagenes.length}`}
                  className={`w-full rounded border border-neutral-200 ${vistaVigente ? '' : 'opacity-50'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
