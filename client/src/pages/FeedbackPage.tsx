import { Helmet } from 'react-helmet-async'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import StructuredData from '../components/StructuredData'
import FeedbackForm from '../components/FeedbackForm'

const META = {
  title: 'Feedback - Voces Indígenas',
  description:
    'Comparte tu opinión, reporta errores o sugiere mejoras para Voces Indígenas.',
  url: `${SEO.siteUrl}/feedback`,
}

const breadcrumb = buildBreadcrumbSchema([
  { name: 'Home', url: SEO.siteUrl },
  { name: 'Feedback', url: META.url },
])

export default function FeedbackPage() {
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
        <h1 className="page-title">Feedback</h1>

        <div className="max-w-md mx-auto mt-8">
          <FeedbackForm hideHeading idPrefix="feedback-page" />
        </div>
      </div>
    </>
  )
}
