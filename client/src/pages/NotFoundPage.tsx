import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SEO } from '../lib/seo'
import NoIndex from '../components/NoIndex'

export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <>
      <Helmet>
        <title>{t('notFound.title')} - {SEO.siteName}</title>
      </Helmet>
      <NoIndex />
      <div className="page-section text-center">
        <h1 className="page-title">{t('notFound.title')}</h1>
        <p className="page-intro">{t('notFound.message')}</p>
        <Link
          to="/"
          className="text-brand-800 hover:text-brand-700 underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
        >
          {t('notFound.goHome')}
        </Link>
      </div>
    </>
  )
}
