import { Helmet } from 'react-helmet-async'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import StructuredData from '../components/StructuredData'
import SubscribeForm from '../components/SubscribeForm'

const META = {
  title: 'Newsletter - Voces Indígenas',
  description: 'Suscríbete al newsletter de Voces Indígenas. Las noticias que importan a los pueblos indígenas, curadas con inteligencia artificial y entregadas en tu correo cada semana.',
  url: `${SEO.siteUrl}/newsletter`,
}

const breadcrumb = buildBreadcrumbSchema([
  { name: 'Inicio', url: SEO.siteUrl },
  { name: 'Newsletter', url: META.url },
])

export default function NewsletterPage() {
  return (
    <>
      <Helmet>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <link rel="canonical" href={META.url} />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={META.url} />
        {CommonOgTags({})}
      </Helmet>
      <StructuredData data={breadcrumb} />
      <div className="page-section py-16">
        <h1 className="page-title">Newsletter</h1>
        <p className="page-intro">
          Noticias de impacto indígena que están transformando el mundo, directamente en tu correo.
        </p>
        <div className="max-w-md mx-auto mt-8">
          <SubscribeForm hideHeading idPrefix="newsletter-page" />
        </div>
      </div>
    </>
  )
}
