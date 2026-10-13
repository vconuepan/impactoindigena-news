import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { BRAND } from '../config'
import { publicApi, ApiError } from '../lib/api'
import { leerEnlaceConfirmacion } from '../lib/enlaceConfirmacion'

/**
 * La pagina del boletin: pide confirmar la suscripcion y, hecho eso, la celebra.
 *
 * Hasta el 11-sep-2026 estaba escrita a mano en ingles, y el parrafo del centro
 * cambiaba de idioma a la mitad: `BRAND.claim` y `BRAND.claimSupport` estan en
 * español y la linea de en medio decia «Weekly to your inbox.». Es el ultimo
 * paso del embudo —el momento en que alguien acaba de decir que si— y es
 * tambien la primera pagina que ve como suscriptor.
 *
 * LA CONFIRMACION ES UN BOTON, NO UN ENLACE (13-oct-2026). El enlace del correo
 * pasa por GET /api/subscribe/confirm, que NO confirma: redirige aca con el
 * token. Confirmar es apretar el boton, que hace un POST. Los filtros de correo
 * corporativos abren los enlaces para revisarlos antes que la persona; si
 * abrirlos confirmara, quien recibiera el correo de un tercero quedaria
 * suscrita sin haber hecho nada. Es el mismo patron que /alertas.
 *
 * Sin token (`/subscribed` a secas) sigue mostrando la bienvenida: es lo que
 * veian quienes confirmaron con el enlace antiguo.
 */

/**
 * Estado de la confirmacion. `error` es el unico que deja reintentar: los otros
 * son finales.
 */
type Confirmacion = 'idle' | 'enviando' | 'confirmed' | 'expired' | 'invalid' | 'error'

export default function SubscribedPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useTranslation()
  const errorParam = searchParams.get('error')

  // Se lee al montar porque despues de confirmar se saca de la URL, y la pagina
  // tiene que seguir mostrando el resultado.
  const [enlace] = useState(() => leerEnlaceConfirmacion(searchParams))
  const pendiente = enlace.estado === 'valido' ? { token: enlace.token, email: enlace.email } : null
  const [confirmacion, setConfirmacion] = useState<Confirmacion>('idle')
  // Un ref y no el estado: dos clics seguidos llegan antes de que React repinte.
  const enviandoRef = useRef(false)
  const tituloRef = useRef<HTMLHeadingElement>(null)

  // El resultado reemplaza a la vista del boton: sin esto el foco se queda en un
  // boton que ya no existe y una persona con lector de pantalla no se entera.
  const terminada = confirmacion === 'confirmed' || confirmacion === 'expired' || confirmacion === 'invalid'
  useEffect(() => {
    if (terminada) tituloRef.current?.focus()
  }, [terminada])

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
      await publicApi.confirmSubscription(pendiente)
      setConfirmacion('confirmed')
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

  // Un enlace vencido o invalido pesa mas que cualquier otra cosa. El parametro
  // `error` es el del redireccionamiento (enlaces sin token) y solo cuenta si no
  // hay una confirmacion pendiente. Un enlace recortado o escrito a mano (token
  // que no es uuid, correo sin forma de correo, uno de los dos solo) se dice,
  // en vez de reflejar su texto o celebrar una suscripcion que nadie confirmo.
  const fallo =
    confirmacion === 'expired' || confirmacion === 'invalid'
      ? confirmacion
      : !pendiente && (errorParam || enlace.estado === 'malformado')
        ? (errorParam ?? 'invalid')
        : null

  if (fallo) {
    const expirado = fallo === 'expired'
    const titulo = expirado ? t('subscribed.expiredTitle') : t('subscribed.invalidTitle')
    const cuerpo = expirado ? t('subscribed.expiredBody') : t('subscribed.invalidBody')

    return (
      <>
        <Helmet>
          <title>{titulo} - Voces Indígenas</title>
          <meta name="description" content={cuerpo} />
        </Helmet>
        <div className="page-section text-center py-16">
          <h1
            ref={tituloRef}
            tabIndex={-1}
            className="text-2xl md:text-3xl font-bold text-neutral-900 mb-4 focus:outline-none"
          >
            {titulo}
          </h1>
          <p className="text-neutral-600 mb-6">{cuerpo}</p>
          <Link
            to="/"
            className="text-brand-800 hover:text-brand-700 font-normal focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
          >
            &larr; {t('subscribed.backHome')}
          </Link>
        </div>
      </>
    )
  }

  if (pendiente && confirmacion !== 'confirmed') {
    const enviando = confirmacion === 'enviando'

    return (
      <>
        <Helmet>
          <title>{t('subscribed.confirmTitle')} - Voces Indígenas</title>
          <meta name="description" content={t('subscribed.confirmIntro')} />
          {/* El enlace lleva un token en la URL: que no quede en un buscador. */}
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="page-section text-center py-16">
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-4">{t('subscribed.confirmTitle')}</h1>
          <p className="text-neutral-600 mb-2 max-w-md mx-auto">{t('subscribed.confirmIntro')}</p>
          {/* Un correo no tiene puntos de corte: sin esto, uno largo se sale de la pagina en un telefono. */}
          <p className="text-neutral-900 font-semibold mb-4 max-w-md mx-auto [overflow-wrap:anywhere]">
            {pendiente.email}
          </p>
          <p className="text-neutral-600 mb-8 max-w-md mx-auto">{t('subscribed.confirmIgnore')}</p>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={enviando}
            className="inline-block px-6 py-2.5 bg-brand-800 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {enviando ? t('subscribed.confirming') : t('subscribed.confirmButton')}
          </button>
          {/* La region existe desde el principio: un aviso que aparece junto con su region no se anuncia. */}
          <div role="status" aria-live="polite" className="mt-4">
            {confirmacion === 'error' && <p className="text-red-700 text-sm">{t('subscribed.confirmError')}</p>}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Helmet>
        <title>{t('subscribed.successTitle')} - Voces Indígenas</title>
        <meta name="description" content={t('subscribed.confirmed')} />
      </Helmet>
      <div className="page-section text-center py-16">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-brand-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1
          ref={tituloRef}
          tabIndex={-1}
          className="text-2xl md:text-3xl font-bold text-neutral-900 mb-4 focus:outline-none"
        >
          {t('subscribed.successTitle')}
        </h1>
        <p className="text-neutral-600 mb-4 max-w-md mx-auto">
          {BRAND.claim}<br className="sm:hidden" />
          {t('subscribed.weekly')}<br />
          {BRAND.claimSupport}
        </p>
        <p className="text-neutral-600 mb-8 max-w-md mx-auto">
          {t('subscribed.confirmed')}
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {t('subscribed.explore')}
        </Link>
      </div>
    </>
  )
}
