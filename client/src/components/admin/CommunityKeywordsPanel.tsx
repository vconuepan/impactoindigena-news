import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, ApiError, type AdminCommunity, type KeywordsPreview, type KeywordsPreviewStory } from '../../lib/admin-api'
import { EditPanel, PANEL_BODY, PANEL_FOOTER } from './EditPanel'
import { useToast } from '../ui/Toast'

/**
 * Editor de las palabras clave de una vertical (D4, pendiente del 6-oct-2026:
 * hasta ahora solo se cambiaban por la API o por SQL).
 *
 * Las palabras clave deciden qué notas pertenecen a la vertical, y se cotejan
 * como PARTE de palabra: el 3-oct-2026 «cam» calzaba en 92 notas publicadas y
 * solo 6 eran sobre la CAM. Por eso no se guarda sin medir: «Guardar» se
 * habilita solo cuando la lista que se guarda es exactamente la que se midió.
 */

/** Los mismos límites que valida el servidor (parseKeywords). */
export const LARGO_MIN = 2
export const LARGO_MAX = 60
export const MAX_PALABRAS = 40

/** Separa por comas, limpia y quita duplicados sin distinguir mayúsculas (igual que el servidor). */
export function parseKeywordList(texto: string): string[] {
  const vistas = new Set<string>()
  const lista: string[] = []
  for (const parte of texto.split(',')) {
    const t = parte.trim()
    if (!t || vistas.has(t.toLowerCase())) continue
    vistas.add(t.toLowerCase())
    lista.push(t)
  }
  return lista
}

/** Firma de una lista para comparar «lo medido» con «lo que se guardaría». */
export function firmaLista(lista: string[]): string {
  return JSON.stringify(lista)
}

/** Lo que el servidor rechazaría, dicho en pantalla antes de medir. */
export function problemasDeLista(lista: string[]): string[] {
  const problemas: string[] = []
  const fuera = lista.filter((k) => k.length < LARGO_MIN || k.length > LARGO_MAX)
  if (fuera.length > 0) problemas.push(`Fuera de rango (${LARGO_MIN} a ${LARGO_MAX} caracteres): ${fuera.join(', ')}`)
  if (lista.length > MAX_PALABRAS) problemas.push(`Como máximo ${MAX_PALABRAS} palabras clave; hay ${lista.length}`)
  return problemas
}

/** Una palabra de hasta 4 letras arrastra fácil notas ajenas (cam → cambio, cámara). */
const LARGO_RIESGOSO = 4

/** La medición es de pertenencia; la retención por vertical se aplica aparte, y conviene decirlo. */
const NOTA_DEL_MODO: Record<KeywordsPreview['mode'], string | null> = {
  off: null,
  shadow: 'La vertical está en sombra: lo que un editor retuvo no se muestra aunque pertenezca.',
  enforce: 'La vertical aplica la revisión: las notas que entren esperan a que un editor las libere.',
}

const ID_CAMPO = 'community-keywords'
const ID_AYUDA = `${ID_CAMPO}-ayuda`
const ID_CORTAS = `${ID_CAMPO}-cortas`
const ID_ERRORES = `${ID_CAMPO}-errores`

function Ejemplos({ notas }: { notas: KeywordsPreviewStory[] }) {
  if (notas.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-neutral-600 list-disc pl-4">
      {notas.map((n) => (
        <li key={n.slug}>{n.title}</li>
      ))}
    </ul>
  )
}

interface Props {
  community: AdminCommunity
  open: boolean
  onClose: () => void
}

export function CommunityKeywordsPanel({ community, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const vigentes = community.keywords ?? []
  const [texto, setTexto] = useState(vigentes.join(', '))
  const [medicion, setMedicion] = useState<{ firma: string; datos: KeywordsPreview } | null>(null)
  const [aceptaVacia, setAceptaVacia] = useState(false)

  const lista = parseKeywordList(texto)
  const problemas = problemasDeLista(lista)
  const firmaActual = firmaLista(lista)
  const sinCambios = firmaActual === firmaLista(vigentes)
  const medida = medicion?.firma === firmaActual ? medicion.datos : null
  const quedaVacia = medida?.propuesta === 0

  const medir = useMutation({
    mutationFn: (propuesta: string[]) => adminApi.communities.previewKeywords(community.id, propuesta),
    // La firma sale de la lista ENVIADA (las variables de la mutación), no de la que
    // hay en pantalla cuando vuelve la respuesta: TanStack Query ejecuta el
    // onSuccess del último render, y si el texto cambió mientras se medía, el
    // closure habría dado por medida una lista que nadie midió.
    onSuccess: (datos, propuesta) => {
      setMedicion({ firma: firmaLista(propuesta), datos })
      setAceptaVacia(false)
    },
    onError: (err) => toast('error', err instanceof ApiError ? err.message : 'No se pudo medir el cambio'),
  })

  const guardar = useMutation({
    mutationFn: (propuesta: string[]) => adminApi.communities.updateKeywords(community.id, propuesta),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminCommunity[]>(['admin', 'communities'], (prev) =>
        prev?.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
      )
      toast('success', `Palabras clave de ${community.name} guardadas`)
      onClose()
    },
    onError: (err) => toast('error', err instanceof ApiError ? err.message : 'No se pudieron guardar las palabras clave'),
  })

  const puedeMedir = lista.length > 0 && problemas.length === 0 && !medir.isPending
  const puedeGuardar = !!medida && !sinCambios && problemas.length === 0 && (!quedaVacia || aceptaVacia) && !guardar.isPending
  const cortas = lista.filter((k) => k.length <= LARGO_RIESGOSO && !vigentes.some((v) => v.toLowerCase() === k.toLowerCase()))
  const describedBy = [ID_AYUDA, cortas.length > 0 && ID_CORTAS, problemas.length > 0 && ID_ERRORES].filter(Boolean).join(' ')

  // Lo que un lector de pantalla oye al cambiar el estado del pie.
  const estado = sinCambios
    ? 'Sin cambios'
    : problemas.length > 0
      ? 'Corrige la lista antes de medir'
      : !medida
        ? 'Mide antes de guardar'
        : quedaVacia && !aceptaVacia
          ? 'Marca la confirmación para guardar'
          : `Medido: serían ${medida.propuesta} notas`

  return (
    <EditPanel open={open} onClose={onClose} title={`Palabras clave · ${community.name}`}>
      <form
        className="flex flex-col flex-1 min-h-0"
        onSubmit={(e) => {
          e.preventDefault()
          if (puedeGuardar) guardar.mutate(lista)
        }}
      >
        <div className={PANEL_BODY}>
          <p className="text-sm text-neutral-600">
            Deciden qué notas pertenecen a la vertical. Cada una se busca como parte de palabra en el título, el
            resumen y el título de la fuente. El cambio queda en el registro de auditoría y, si la vertical está en
            revisión, la cola se concilia al guardar.
          </p>

          <div>
            <label htmlFor={ID_CAMPO} className="block text-sm font-medium text-neutral-700 mb-1">
              Palabras clave, separadas por comas
            </label>
            <textarea
              id={ID_CAMPO}
              rows={5}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={problemas.length > 0}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 aria-[invalid=true]:border-red-500"
            />
            <p id={ID_AYUDA} className="mt-1 text-xs text-neutral-500">
              {lista.length} {lista.length === 1 ? 'palabra' : 'palabras'} · entre 1 y {MAX_PALABRAS}, de {LARGO_MIN} a {LARGO_MAX} caracteres cada una
            </p>
            {problemas.length > 0 && (
              <p id={ID_ERRORES} className="mt-1 text-xs text-red-700" role="alert">
                {problemas.join('. ')}
              </p>
            )}
            {cortas.length > 0 && (
              <p id={ID_CORTAS} className="mt-1 text-xs text-amber-700" role="note">
                Palabras cortas ({cortas.join(', ')}): se buscan como parte de otras palabras. Revisa qué notas traen.
              </p>
            )}
          </div>

          {medida && (
            <section aria-label="Efecto del cambio" className="rounded-md border border-neutral-200 p-3 space-y-3 text-sm">
              <p className="font-medium text-neutral-900">
                A la vertical le pertenecen hoy {medida.actual} notas; con esta lista serían {medida.propuesta}.
              </p>
              <p className="text-xs text-neutral-500">
                Pertenencia medida con la regla de la página: publicada y relevancia 3 o más.
                {NOTA_DEL_MODO[medida.mode] && <> {NOTA_DEL_MODO[medida.mode]}</>}
              </p>

              {quedaVacia && (
                <div className="rounded bg-red-50 p-2 text-red-800" role="alert">
                  <p className="font-medium">La vertical quedaría vacía.</p>
                  <label className="mt-1 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={aceptaVacia} onChange={(e) => setAceptaVacia(e.target.checked)} />
                    Entiendo que la página de la vertical no mostrará ninguna nota
                  </label>
                </div>
              )}

              <div>
                <p className="text-neutral-800">Entran {medida.entran.total}</p>
                <Ejemplos notas={medida.entran.ejemplos} />
              </div>
              <div>
                <p className="text-neutral-800">Salen {medida.salen.total}</p>
                <Ejemplos notas={medida.salen.ejemplos} />
              </div>

              {medida.nuevas.length > 0 && (
                <div>
                  <p className="text-neutral-800">Cada palabra nueva, por sí sola</p>
                  <ul className="mt-1 space-y-2">
                    {medida.nuevas.map((n) => (
                      <li key={n.keyword}>
                        <span className="font-medium">{n.keyword}</span>: {n.notas} {n.notas === 1 ? 'nota' : 'notas'}
                        <Ejemplos notas={n.ejemplos} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {medida.quitadas.length > 0 && (
                <p className="text-neutral-800">Se quitan: {medida.quitadas.join(', ')}</p>
              )}
            </section>
          )}
        </div>

        <div className={PANEL_FOOTER}>
          <button
            type="button"
            onClick={() => medir.mutate(lista)}
            disabled={!puedeMedir}
            className="px-4 py-2 text-sm font-medium border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50"
          >
            {medir.isPending ? 'Midiendo…' : 'Medir el cambio'}
          </button>
          <button
            type="submit"
            disabled={!puedeGuardar}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          <p className="self-center text-xs text-neutral-500" aria-live="polite">
            {estado}
          </p>
        </div>
      </form>
    </EditPanel>
  )
}
