import { useSearchParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { BRAND } from '../config'

/**
 * La pagina que ve alguien justo despues de confirmar su suscripcion.
 *
 * Hasta el 11-sep-2026 estaba escrita a mano en ingles, y el parrafo del centro
 * cambiaba de idioma a la mitad: `BRAND.claim` y `BRAND.claimSupport` estan en
 * español y la linea de en medio decia «Weekly to your inbox.». Es el ultimo
 * paso del embudo —el momento en que alguien acaba de decir que si— y es
 * tambien la primera pagina que ve como suscriptor.
 */
export default function SubscribedPage() {
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const error = searchParams.get('error')

  if (error) {
    const expirado = error === 'expired'
    const titulo = expirado ? t('subscribed.expiredTitle') : t('subscribed.invalidTitle')
    const cuerpo = expirado ? t('subscribed.expiredBody') : t('subscribed.invalidBody')

    return (
      <>
        <Helmet>
          <title>{titulo} - Voces Indígenas</title>
          <meta name="description" content={cuerpo} />
        </Helmet>
        <div className="page-section text-center py-16">
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-4">{titulo}</h1>
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
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-4">{t('subscribed.successTitle')}</h1>
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
