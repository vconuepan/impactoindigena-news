import { Helmet } from 'react-helmet-async'
import { GITHUB_REPO_URL } from '../config'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

interface Credit {
  name: string
  url: string
  description: string
}

const FRONTEND_CREDITS: Credit[] = [
  { name: 'React', url: 'https://github.com/facebook/react', description: 'UI framework' },
  { name: 'Vite', url: 'https://github.com/vitejs/vite', description: 'Build tooling and dev server' },
  { name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', description: 'Utility-first CSS' },
  { name: 'TanStack Query', url: 'https://github.com/TanStack/query', description: 'Data fetching and caching' },
  { name: 'React Router', url: 'https://github.com/remix-run/react-router', description: 'Client-side routing' },
  { name: 'Headless UI', url: 'https://github.com/tailwindlabs/headlessui', description: 'Accessible UI primitives' },
  { name: 'Heroicons', url: 'https://github.com/tailwindlabs/heroicons', description: 'Icon set' },
  { name: 'react-helmet-async', url: 'https://github.com/staylor/react-helmet-async', description: 'Document head management' },
  { name: 'react-markdown', url: 'https://github.com/remarkjs/react-markdown', description: 'Markdown rendering' },
]

const BACKEND_CREDITS: Credit[] = [
  { name: 'Express', url: 'https://github.com/expressjs/express', description: 'Web framework' },
  { name: 'Prisma', url: 'https://github.com/prisma/prisma', description: 'Database ORM' },
  { name: 'LangChain', url: 'https://github.com/langchain-ai/langchainjs', description: 'LLM orchestration' },
  { name: 'Zod', url: 'https://github.com/colinhacks/zod', description: 'Schema validation' },
  { name: 'Pino', url: 'https://github.com/pinojs/pino', description: 'Logging' },
  { name: 'Cheerio', url: 'https://github.com/cheeriojs/cheerio', description: 'HTML parsing' },
  { name: 'Readability', url: 'https://github.com/mozilla/readability', description: 'Article extraction' },
  { name: 'node-cron', url: 'https://github.com/node-cron/node-cron', description: 'Job scheduling' },
  { name: 'rss-parser', url: 'https://github.com/rbren/rss-parser', description: 'Feed parsing' },
  { name: 'PDFKit', url: 'https://github.com/foliojs/pdfkit', description: 'PDF generation' },
  { name: 'Axios', url: 'https://github.com/axios/axios', description: 'HTTP client' },
]

const TOOLING_CREDITS: Credit[] = [
  { name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript', description: 'Type-safe JavaScript' },
  { name: 'Vitest', url: 'https://github.com/vitest-dev/vitest', description: 'Test runner' },
]

const SOCIAL_CREDITS: Credit[] = [
  { name: 'AT Protocol SDK', url: 'https://github.com/bluesky-social/atproto', description: 'Bluesky integration' },
  { name: 'Masto.js', url: 'https://github.com/neet/masto.js', description: 'Mastodon integration' },
]

function CreditList({ title, credits }: { title: string; credits: Credit[] }) {
  return (
    <>
      <h2 className="section-heading mt-8">{title}</h2>
      <ul className="space-y-1.5 my-4">
        {credits.map((credit) => (
          <li key={credit.name}>
            <a
              href={credit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-800 hover:text-brand-700 font-medium"
            >
              {credit.name}
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            <span className="text-neutral-500"> &mdash; {credit.description}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function ThankYouPage() {
  return (
    <>
      <Helmet>
        <title>Thank You - {SEO.siteName}</title>
        <meta name="description" content="Credits and acknowledgments for the open-source projects and people behind Voces Indígenas." />
        <link rel="canonical" href={`${SEO.siteUrl}/thank-you`} />
        <meta property="og:title" content={`Thank You - ${SEO.siteName}`} />
        <meta property="og:description" content="Credits and acknowledgments for the open-source projects and people behind Voces Indígenas." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/thank-you`} />
        {CommonOgTags({})}
      </Helmet>
      <StructuredData data={[
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: `Thank You - ${SEO.siteName}`,
          description: 'Credits and acknowledgments for the open-source projects and people behind Voces Indígenas.',
          url: `${SEO.siteUrl}/thank-you`,
          isPartOf: { '@type': 'WebSite', name: SEO.siteName, url: SEO.siteUrl },
        },
        buildBreadcrumbSchema([
          { name: 'Home', url: SEO.siteUrl },
          { name: 'Thank You' },
        ]),
      ]} />

      <div className="page-section">
        <h1 className="page-title">Thank You</h1>
        <p className="page-intro">
          Voces Indígenas is built on the work of many talented people and open-source communities.
          The platform itself is{' '}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
          >
            open source on GitHub
            <span className="sr-only"> (opens in new tab)</span>
          </a>
          .
        </p>

        <div className="prose max-w-none">
          <h2 className="section-heading mt-8">Design</h2>
          <p>Logo by Erneste Design</p>

          <CreditList title="Frontend" credits={FRONTEND_CREDITS} />
          <CreditList title="Backend" credits={BACKEND_CREDITS} />
          <CreditList title="Tooling" credits={TOOLING_CREDITS} />
          <CreditList title="Social" credits={SOCIAL_CREDITS} />

          <hr className="my-10 border-neutral-200" />

          <p>
            Listed on{' '}
            <a
              href="https://www.toolpilot.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-800 hover:text-brand-700"
            >
              ToolPilot.ai
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          </p>
        </div>
      </div>
    </>
  )
}
