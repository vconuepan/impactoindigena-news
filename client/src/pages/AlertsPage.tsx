/**
 * /alertas — subscribe to topic-based daily email alerts
 */
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams, Link } from 'react-router-dom'
import { publicApi } from '../lib/api'

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

export default function AlertsPage() {
  const [searchParams] = useSearchParams()
  const confirmed  = searchParams.get('confirmed')
  const unsubEmail = searchParams.get('unsubscribe') // legacy links already in inboxes
  const unsubToken = searchParams.get('unsubscribe_token')

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

  async function handleUnsubscribe() {
    if (!unsubEmail && !unsubToken) return
    try {
      await publicApi.unsubscribeAlerts(unsubToken ? { token: unsubToken } : { email: unsubEmail! })
      setMessage('Tus alertas han sido desactivadas.')
    } catch {
      setMessage('No se pudo desactivar. Escríbenos a contacto@fundacionkm.org.')
    }
  }

  return (
    <>
      <Helmet>
        <title>Alertas de territorio — Impacto Indígena</title>
        <meta
          name="description"
          content="Suscríbete a alertas diarias sobre pueblos o temas específicos: Mapuche, litio, Amazonia, consulta previa y más."
        />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Confirmed state */}
        {confirmed === 'true' && (
          <div className="mb-8 bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
            <p className="text-emerald-800 font-semibold text-base mb-1">¡Alertas activadas!</p>
            <p className="text-emerald-700 text-sm">Recibirás un email cada vez que haya nuevas noticias sobre tus temas.</p>
          </div>
        )}

        {(confirmed === 'expired' || confirmed === 'invalid') && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-800 font-semibold text-base mb-1">
              {confirmed === 'expired' ? 'Enlace expirado' : 'Enlace inválido'}
            </p>
            <p className="text-red-700 text-sm">Vuelve a suscribirte para recibir un enlace nuevo.</p>
          </div>
        )}

        {/* Unsubscribe state */}
        {(unsubEmail || unsubToken) && (
          <div className="mb-8 bg-neutral-50 border border-neutral-200 rounded-xl p-6 text-center">
            {message ? (
              <p className="text-neutral-700 text-sm">{message}</p>
            ) : (
              <>
                <p className="text-neutral-800 text-sm mb-3">
                  {unsubEmail
                    ? <>¿Desactivar todas las alertas para <strong>{unsubEmail}</strong>?</>
                    : <>¿Desactivar todas tus alertas de territorio?</>}
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
                      className={`px-3 py-2 rounded-lg text-sm font-medium text-left transition-all border ${
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
