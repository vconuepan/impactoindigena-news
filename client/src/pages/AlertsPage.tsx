/**
 * /alertas — subscribe to topic-based daily email alerts
 */
import { useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams, Link } from 'react-router-dom'
import { publicApi, ApiError } from '../lib/api'
import { leerEnlaceConfirmacion } from '../lib/enlaceConfirmacion'

// Predefined topics the user can subscribe to
const TOPICS = [
  { id: 'mapuche',          label: 'Pueblo Mapuche' },
  { id: 'aymara',           label: 'Pueblo Aymara' },
  { id: 'amazonia',         label: 'Amazonia' },
  { id: 'litio',            label: 'Litio y minería' },
  { id: 'wallmapu',         label: 'Wallmapu' },
  { id: 'consulta previa',  label: 'Consulta previa' },
  { id: 'territorio',       label: 'Territorio y tierra' },
  { id: 'peru',             label: 'Perú' },
  { id: 'bolivia',          label: 'Bolivia' },
  { id: 'colombia',         label: 'Colombia' },
  { id: 'chile',            label: 'Chile' },
  { id: 'derechos',         label: 'Derechos indígenas' },
  { id: 'medio ambiente',   label: 'Medio ambiente' },
  { id: 'onu',              label: 'ONU / UNPFII' },
]

type Status = 'idle' | 'submitting' | 'success' | 'error'

// El envio es UN correo al dia con las notas de las ultimas 24 h (sendDailyAlerts),
// no uno por noticia. Lo comparten la caja nueva y el aviso heredado ?confirmed=true.
const TEXTO_ALTA = 'Recibirás un correo al día cuando haya noticias nuevas sobre tus temas.'

/**
 * Estado de la confirmacion. `error` es el unico que deja reintentar: los otros
 * cuatro son finales.
 */
type Confirmacion = 'idle' | 'enviando' | 'confirmed' | 'changed' | 'expired' | 'invalid' | 'error'

export default function AlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const confirmed  = searchParams.get('confirmed')
  // Enlace ANTIGUO, de correos anteriores al 10-jun-2026. Ya no da de baja: el
  // servidor exige el token porque identificar por correo permitia que
  // cualquiera diera de baja a cualquiera. Se sigue leyendo para explicarle a
  // quien llegue por ahi como hacerlo, en vez de dejarlo sin salida.
  const unsubEmailLegado = searchParams.get('unsubscribe')
  const unsubToken = searchParams.get('unsubscribe_token')

  // Confirmacion de alertas (alta o cambio de temas). El enlace del correo pasa por
  // GET /api/alerts/confirm, que NO confirma: redirige aca con el token. Confirmar
  // es apretar el boton, que hace un POST. Los filtros de correo corporativos
  // abren los enlaces para revisarlos antes que la persona; si abrir la pagina
  // confirmara, un cambio de temas pedido por un tercero quedaria aplicado solo.
  //
  // Se lee al montar porque despues de confirmar se saca de la URL, y la caja
  // tiene que seguir mostrando el resultado. Un enlace recortado o escrito a
  // mano (token que no es uuid, correo sin forma de correo, uno de los dos solo)
  // no se refleja en pantalla: se avisa de enlace invalido.
  const [enlace] = useState(() => leerEnlaceConfirmacion(searchParams))
  const pendiente = enlace.estado === 'valido' ? { token: enlace.token, email: enlace.email } : null
  const [confirmacion, setConfirmacion] = useState<Confirmacion>('idle')
  // Un ref y no el estado: dos clics seguidos llegan antes de que React repinte.
  const enviandoRef = useRef(false)
  const resultadoRef = useRef<HTMLDivElement>(null)

  // El resultado reemplaza al boton: sin esto el foco se queda en un boton que
  // ya no existe y quien navega con teclado vuelve al principio de la pagina.
  const terminada = confirmacion === 'confirmed' || confirmacion === 'changed' || confirmacion === 'expired' || confirmacion === 'invalid'
  useEffect(() => {
    if (terminada) resultadoRef.current?.focus()
  }, [terminada])

  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set())
  const [email, setEmail]     = useState('')
  const [status, setStatus]   = useState<Status>('idle')
  const [message, setMessage] = useState('')

  function toggleTopic(id: string) {
    setSelectedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedTopics.size === 0 || !email) return

    setStatus('submitting')
    try {
      await publicApi.subscribeAlerts(email, Array.from(selectedTopics))
      setStatus('success')
      setMessage('')
    } catch {
      setStatus('error')
      setMessage('Algo salió mal. Intenta de nuevo.')
    }
  }

  /** Saca el token y el correo de la barra de direcciones: ya no sirven. */
  function limpiarUrl() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('confirm_token')
        next.delete('email')
        return next
      },
      { replace: true },
    )
  }

  async function handleConfirm() {
    if (!pendiente || enviandoRef.current) return
    enviandoRef.current = true
    setConfirmacion('enviando')
    try {
      const { result } = await publicApi.confirmAlerts(pendiente)
      setConfirmacion(result === 'changed' ? 'changed' : 'confirmed')
      limpiarUrl()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setConfirmacion(err.message === 'expired' ? 'expired' : 'invalid')
        limpiarUrl()
        return
      }
      // Red caida, limite de intentos o error del servidor: se puede reintentar.
      setConfirmacion('error')
      enviandoRef.current = false
    }
  }

  async function handleUnsubscribe() {
    if (!unsubToken) return
    try {
      await publicApi.unsubscribeAlerts({ token: unsubToken })
      setMessage('Tus alertas han sido desactivadas.')
    } catch {
      setMessage('No se pudo desactivar. Escríbenos a contacto@fundacionkm.org.')
    }
  }

  return (
    <>
      <Helmet>
        <title>Alertas de territorio — Voces Indígenas</title>
        <meta
          name="description"
          content="Suscríbete a alertas diarias sobre pueblos o temas específicos: Mapuche, litio, Amazonia, consulta previa y más."
        />
        {enlace.estado !== 'ausente' && <meta name="robots" content="noindex" />}
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Confirmed state */}
        {confirmed === 'true' && (
          <div className="mb-8 bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
            <p className="text-emerald-800 font-semibold text-base mb-1">¡Alertas activadas!</p>
            <p className="text-emerald-700 text-sm">{TEXTO_ALTA}</p>
          </div>
        )}

        {(confirmed === 'expired' || confirmed === 'invalid' || enlace.estado === 'malformado') && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-800 font-semibold text-base mb-1">
              {confirmed === 'expired' ? 'Enlace expirado' : 'Enlace inválido'}
            </p>
            <p className="text-red-700 text-sm">Vuelve a suscribirte para recibir un enlace nuevo.</p>
          </div>
        )}

        {/* Confirmacion con boton: abrir el enlace no confirma nada */}
        {pendiente && (
          <div className="mb-8 bg-neutral-50 border border-neutral-200 rounded-xl p-6 text-center">
            {(confirmacion === 'idle' || confirmacion === 'enviando' || confirmacion === 'error') && (
              <>
                <p className="text-neutral-900 font-semibold text-base mb-2">Confirma tus alertas</p>
                <p className="text-neutral-700 text-sm mb-4 leading-relaxed">
                  Para activar las alertas de{' '}
                  {/* Un correo no tiene puntos de corte: sin esto, uno largo se sale de la caja en un telefono. */}
                  <strong className="[overflow-wrap:anywhere]">{pendiente.email}</strong>, o aplicar el
                  cambio de temas que pediste, confirma aquí. Si no lo pediste, cierra esta
                  página y no cambia nada.
                </p>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirmacion === 'enviando'}
                  className="px-4 py-2 bg-brand-800 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {confirmacion === 'enviando' ? 'Confirmando…' : 'Confirmar'}
                </button>
              </>
            )}
            <div role="status" aria-live="polite">
              {confirmacion === 'error' && (
                <p className="text-red-700 text-sm mt-3">No se pudo confirmar. Intenta de nuevo en unos minutos.</p>
              )}
              {terminada && (
                <div ref={resultadoRef} tabIndex={-1} className="focus:outline-none">
                  {confirmacion === 'confirmed' && (
                    <>
                      <p className="text-emerald-800 font-semibold text-base mb-1">¡Alertas activadas!</p>
                      <p className="text-emerald-700 text-sm">{TEXTO_ALTA}</p>
                    </>
                  )}
                  {confirmacion === 'changed' && (
                    <>
                      <p className="text-emerald-800 font-semibold text-base mb-1">Tus temas se actualizaron</p>
                      <p className="text-emerald-700 text-sm">Desde ahora recibirás alertas sobre los temas nuevos.</p>
                    </>
                  )}
                  {(confirmacion === 'expired' || confirmacion === 'invalid') && (
                    <>
                      <p className="text-red-800 font-semibold text-base mb-1">
                        {confirmacion === 'expired' ? 'Enlace expirado' : 'Enlace inválido'}
                      </p>
                      <p className="text-red-700 text-sm">Vuelve a suscribirte para recibir un enlace nuevo.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Baja con token — el unico camino que da de baja */}
        {unsubToken && (
          <div className="mb-8 bg-neutral-50 border border-neutral-200 rounded-xl p-6 text-center">
            {message ? (
              <p className="text-neutral-700 text-sm">{message}</p>
            ) : (
              <>
                <p className="text-neutral-800 text-sm mb-3">
                  ¿Desactivar todas tus alertas de territorio?
                </p>
                <button
                  onClick={handleUnsubscribe}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  Sí, desactivar alertas
                </button>
              </>
            )}
          </div>
        )}

        {/* Enlace antiguo: no se da de baja, pero tampoco se deja sin salida */}
        {unsubEmailLegado && !unsubToken && (
          <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
            <p className="text-amber-900 font-semibold text-base mb-2">Este enlace de baja es antiguo</p>
            <p className="text-amber-800 text-sm">
              Por seguridad ya no damos de baja a partir de un enlace que lleva la
              dirección de correo: cualquiera que la conociera podría desactivar
              las alertas de otra persona.{" "}
              <strong>Abre cualquier alerta reciente y usa el enlace del pie</strong>,
              que sí te identifica. Si no encuentras ninguna, escríbenos a{" "}
              <a href="mailto:contacto@fundacionkm.org" className="underline">contacto@fundacionkm.org</a>{" "}
              y lo hacemos nosotros.
            </p>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 mb-3">Alertas de territorio</h1>
          <p className="text-sm text-neutral-500 leading-relaxed">
            Selecciona los temas que te interesan. Te enviaremos un email diario cuando haya nuevas noticias publicadas que coincidan con tu selección.
          </p>
        </div>

        {status === 'success' ? (
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-8 text-center">
            <div className="text-3xl mb-3">📬</div>
            <p className="text-brand-900 font-semibold text-base mb-2">Revisa tu correo</p>
            <p className="text-brand-700 text-sm leading-relaxed">
              Te enviamos un enlace de confirmación a <strong>{email}</strong>.
              Haz clic en él para activar tus alertas.
            </p>
            <button
              onClick={() => { setStatus('idle'); setEmail(''); setSelectedTopics(new Set()) }}
              className="mt-4 text-sm text-brand-600 hover:underline"
            >
              Suscribir otro correo
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Topic grid */}
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-3">
                Elige tus temas <span className="text-neutral-400">(selecciona al menos uno)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TOPICS.map((topic) => {
                  const selected = selectedTopics.has(topic.id)
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => toggleTopic(topic.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors duration-150 ease-out border ${
                        selected
                          ? 'bg-brand-800 text-white border-brand-800'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-brand-300 hover:text-brand-700'
                      }`}
                    >
                      {selected && <span className="mr-1.5 text-xs">✓</span>}
                      {topic.label}
                    </button>
                  )
                })}
              </div>
              {selectedTopics.size > 0 && (
                <p className="text-xs text-neutral-400 mt-2">
                  {selectedTopics.size} {selectedTopics.size === 1 ? 'tema seleccionado' : 'temas seleccionados'}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="alert-email" className="block text-sm font-medium text-neutral-700 mb-1.5">
                Tu correo electrónico
              </label>
              <input
                id="alert-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full border border-neutral-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {status === 'error' && (
              <p className="text-sm text-red-600">{message}</p>
            )}

            <button
              type="submit"
              disabled={status === 'submitting' || selectedTopics.size === 0}
              className="w-full py-3 bg-brand-800 text-white font-semibold text-sm rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {status === 'submitting' ? 'Enviando…' : 'Activar alertas'}
            </button>

            <p className="text-xs text-neutral-400 text-center">
              Doble confirmación por email. Sin publicidad. Puedes darte de baja en cualquier momento.
            </p>
          </form>
        )}

        <div className="mt-10 pt-6 border-t border-neutral-100 text-center">
          <p className="text-xs text-neutral-400 mb-2">¿Prefieres el boletín semanal?</p>
          <Link to="/newsletter" className="text-sm text-brand-600 hover:underline">
            Suscribirse al boletín →
          </Link>
        </div>
      </div>
    </>
  )
}
