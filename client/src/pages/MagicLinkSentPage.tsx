import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { publicApi } from '../lib/api'
import { safeInternalPath } from '../lib/safePath'

const RESEND_COOLDOWN_SECONDS = 60
const DEFAULT_REDIRECT = '/comunidades'

export default function MagicLinkSentPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  // `redirect_to` llega desde la barra de direcciones y termina en un <Link>.
  // Sin filtrar, un `//evil.com` o `/\evil.com` saca al visitante del sitio
  // desde una página de autenticación, que es donde el phishing convence más.
  // Se conserva `undefined` cuando el parámetro no viene, para no inventarle un
  // destino al correo de reenvío que el enlace original no pedía.
  const rawRedirect = searchParams.get('redirect_to')
  const redirectParam = rawRedirect ? safeInternalPath(rawRedirect, DEFAULT_REDIRECT) : undefined
  const redirectTo = redirectParam ?? DEFAULT_REDIRECT
  const isExpired = searchParams.get('error') === 'expired'

  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])

  async function handleResend() {
    if (!email || secondsLeft > 0 || resendState === 'sending') return
    setResendState('sending')
    try {
      await publicApi.auth.resendMagicLink(email, redirectParam)
      setResendState('sent')
      setSecondsLeft(RESEND_COOLDOWN_SECONDS)
    } catch {
      setResendState('error')
    }
  }

  return (
    <>
      <Helmet>
        <title>Revisa tu correo — Impacto Indígena</title>
      </Helmet>

      <div className="page-section flex flex-col items-center text-center py-16">
        <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mb-6" aria-hidden="true">
          <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>

        {isExpired ? (
          <>
            <h1 className="text-2xl font-bold mb-3">El enlace expiró</h1>
            <p className="text-neutral-500 max-w-sm mb-6">
              Los enlaces de acceso son válidos por 10 minutos.
              {email ? ' Solicita uno nuevo abajo.' : ' Vuelve a la comunidad e intenta de nuevo.'}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-3">Revisa tu correo</h1>
            <p className="text-neutral-500 max-w-sm mb-2">
              Te enviamos un enlace de acceso
              {email ? <> a <strong className="text-neutral-700">{email}</strong></> : ''}.
            </p>
            <p className="text-neutral-400 text-sm mb-6">El enlace expira en 10 minutos.</p>
          </>
        )}

        {email && (
          <div className="flex flex-col items-center gap-2">
            {resendState === 'sent' ? (
              <p className="text-sm text-brand-600 font-medium">Enviado. Revisa tu correo.</p>
            ) : resendState === 'error' ? (
              <p className="text-sm text-red-600">Error al enviar. Intenta de nuevo.</p>
            ) : null}

            <button
              onClick={handleResend}
              disabled={secondsLeft > 0 || resendState === 'sending'}
              className="text-sm text-brand-800 hover:text-brand-700 disabled:text-neutral-400 disabled:cursor-not-allowed transition-colors"
            >
              {resendState === 'sending'
                ? 'Enviando...'
                : secondsLeft > 0
                  ? `Reenviar en ${secondsLeft}s`
                  : 'Reenviar enlace'}
            </button>
          </div>
        )}

        <Link
          to={redirectTo}
          className="mt-8 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          &larr; Volver
        </Link>
      </div>
    </>
  )
}
