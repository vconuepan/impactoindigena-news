import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import StructuredData from '../components/StructuredData'
import ComparisonTable from '../components/ComparisonTable'
import { API_BASE } from '../lib/api'
import { useSources } from '../hooks/useSources'

const META = {
  title: 'API de noticias ind\u00edgenas \u2014 Gratis y sin clave | Voces Ind\u00edgenas',
  description:
    'API gratuita con noticias ind\u00edgenas y globales seleccionadas por IA. Sin clave de acceso, sin publicidad en los datos. Recibe notas sobre derechos ind\u00edgenas, medio ambiente y más.',
  url: `${SEO.siteUrl}/free-api`,
}

const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: META.title,
  description: META.description,
  url: META.url,
  mainEntity: {
    '@type': 'WebAPI',
    name: 'API de noticias de Voces Ind\u00edgenas',
    description:
      'API gratuita y curada de noticias sobre derechos ind\u00edgenas, medio ambiente y temas globales. Sin autenticación requerida.',
    url: `${SEO.siteUrl}/developers`,
    documentation: `${SEO.siteUrl}/developers`,
    provider: {
      '@type': 'Organization',
      name: 'Voces Ind\u00edgenas',
      url: SEO.siteUrl,
    },
  },
}

const breadcrumb = buildBreadcrumbSchema([
  { name: 'Inicio', url: SEO.siteUrl },
  { name: 'API gratuita', url: META.url },
])

const COMPARISON_HEADERS = ['', 'Voces Ind\u00edgenas', 'API de noticias típica (NewsAPI, GNews, etc.)']

const COMPARISON_ROWS = [
  {
    feature: 'Contenido',
    cells: [
      { text: 'Curado previamente, seleccionado por IA según relevancia', check: true },
      'Flujo masivo \u2014 millones de artículos sin filtrar',
    ],
  },
  {
    feature: 'Clave API',
    cells: [
      { text: 'No requerida', check: true },
      'Requerida (registro + a menudo tarjeta de crédito)',
    ],
  },
  {
    feature: 'Publicidad en la respuesta',
    cells: [
      { text: 'Nunca', check: true },
      'A veces (espacios patrocinados)',
    ],
  },
  {
    feature: 'Enfoque',
    cells: [
      { text: 'Temas globales (4 dominios)', check: true },
      'General (de todo)',
    ],
  },
  {
    feature: 'Coste',
    cells: [
      { text: 'Gratis', check: true },
      'Nivel gratuito + planes de pago ($50\u2013$500+/mes)',
    ],
  },
]

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/stories',
    description: 'Noticias curadas del día (paginadas)',
  },
  {
    method: 'GET',
    path: '/api/stories?issueSlug=',
    description: 'Filtrar por área temática (ej., planet-climate, human-development)',
  },
  {
    method: 'GET',
    path: '/api/stories/:slug',
    description: 'Noticia individual por slug',
  },
  {
    method: 'GET',
    path: '/api/issues',
    description: 'Todas las áreas temáticas con metadatos y nombres de fuentes',
  },
  {
    method: 'GET',
    path: '/api/feed',
    description: 'Feed RSS (todas las áreas temáticas)',
  },
]

const USE_CASES = [
  {
    title: 'Incorporar noticias curadas en tu sitio',
    description:
      'Añade una sección de "Noticias globales que importan" a tu sitio de ONG, blog o plataforma comunitaria. Obtén las noticias del día y muéstralas con tu propio diseño.',
  },
  {
    title: 'Alimentar un bot de Slack o Discord',
    description:
      'Envía un resumen curado de noticias globales al canal de tu equipo. La API devuelve datos estructurados fáciles de formatear para plataformas de mensajería.',
  },
  {
    title: 'Integrar en un panel de investigación',
    description:
      'Monitorea la cobertura de política climática, salud global o seguridad a lo largo del tiempo. La API incluye puntuaciones de relevancia, áreas temáticas y metadatos de fuentes.',
  },
  {
    title: 'Construir herramientas educativas',
    description:
      'Usa noticias curadas con puntuación de relevancia en currículos de alfabetización mediática o herramientas de debate en el aula.',
  },
  {
    title: 'Enriquecer tu propio pipeline de IA',
    description:
      'Usa el resultado curado de Voces Indígenas como señal de alta calidad para tus propios sistemas de análisis, resumen o alertas.',
  },
]

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  )
}

export default function FreeApiPage() {
  const { data: sources } = useSources()
  return (
    <>
      <Helmet>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={META.url} />
        <link rel="canonical" href={META.url} />
        {CommonOgTags({})}
      </Helmet>
      <StructuredData data={[pageSchema, breadcrumb]} />

      <div className="page-section">
        <h1 className="page-title">Una API gratuita para noticias que importan</h1>
        <div className="prose max-w-none">
          <p className="text-lg text-neutral-600 leading-relaxed">
            La mayoría de las APIs de noticias te dan un flujo masivo: millones de artículos sin
            procesar que tienes que filtrar tú mismo. Voces Ind\u00edgenas te da la señal: una
            selección curada de noticias al día, elegidas por IA según su relevancia real
            desde{sources ? ` ${sources.totalCount}` : ''} fuentes curadas en múltiples idiomas.
          </p>
          <p>Sin clave API. Sin publicidad en la respuesta.</p>

          {/* Quick Start */}
          <h2 className="section-heading mt-10">Inicio rápido</h2>
          <pre className="bg-neutral-900 text-neutral-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
            <code>{`# Obtener las noticias curadas del día
curl ${API_BASE}/stories

# Filtrar por área temática
curl "${API_BASE}/stories?issueSlug=planet-climate"`}</code>
          </pre>
          <p className="text-sm text-neutral-500 mt-3">
            Estos endpoints devuelven JSON. Usa curl, fetch() o cualquier cliente HTTP. Las
            respuestas no se verán bien en un navegador. La respuesta incluye: título, resumen,
            descripción breve, fuente, URL, área temática, puntuaciones de relevancia, fecha de
            publicación y más.
          </p>
          <p className="mt-2">
            <Link to="/developers" className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              Documentación completa de la API            </Link>
          </p>

        </div>

        {/* What Makes This Different — colored cards */}
        <h2 className="section-heading mt-10">Qué la hace diferente</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {[
            {
              icon: (
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              ),
              title: 'Curada, no en bruto',
              description: 'Cada noticia pasa por un pipeline de IA en múltiples etapas. Obtienes criterio editorial, no una búsqueda por palabras clave entre millones de artículos.',
              border: 'border-l-brand-400',
            },
            {
              icon: (
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              ),
              title: 'Sin clave requerida',
              description: 'Llama al endpoint. Obtén los datos. Sin registro, sin OAuth, sin página de facturación. Diseñada para integraciones rápidas.',
              border: 'border-l-teal-400',
            },
            {
              icon: (
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              ),
              title: 'Sin publicidad en los datos',
              description: 'JSON limpio. Sin espacios patrocinados, sin enlaces de afiliado, sin noticias promovidas. Lo que recibes es lo que curamos.',
              border: 'border-l-amber-400',
            },
            {
              icon: (
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: 'Enfoque en temas globales',
              description: 'Cuatro dominios: Desarrollo Humano, Planeta y Clima, Amenazas Existenciales y Ciencia y Tecnología.',
              border: 'border-l-indigo-400',
            },
          ].map((card) => (
            <div
              key={card.title}
              className={`bg-white border border-neutral-200 ${card.border} border-l-4 rounded-lg p-5`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-neutral-500">{card.icon}</span>
                <h3 className="font-bold text-neutral-800">{card.title}</h3>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">{card.description}</p>
            </div>
          ))}
        </div>
        <div className="prose max-w-none mt-4">
          <p>
            <Link to="/methodology" className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              Conoce cómo funciona nuestra curación
            </Link>
          </p>
        </div>

        {/* Use Cases — Accordions */}
        <h2 className="section-heading mt-10">Casos de uso</h2>
        <div className="mt-4 space-y-2">
          {USE_CASES.map((uc) => (
            <Disclosure key={uc.title} as="div" className="border border-neutral-200 rounded-lg">
              <DisclosureButton className="flex w-full items-center justify-between px-5 py-4 text-left font-bold text-neutral-800 hover:bg-neutral-50 transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-brand-500">
                {uc.title}
                <ChevronIcon className="w-5 h-5 text-neutral-400 data-[open]:rotate-180 transition-transform shrink-0" />
              </DisclosureButton>
              <DisclosurePanel className="px-5 pb-4 text-sm text-neutral-600 leading-relaxed">
                {uc.description}
              </DisclosurePanel>
            </Disclosure>
          ))}
        </div>

        {/* What's Available — Styled Endpoint Cards */}
        <h2 className="section-heading mt-10">Qué está disponible</h2>
        <div className="mt-4 space-y-3">
          {ENDPOINTS.map((ep) => (
            <div key={ep.path} className="flex items-start gap-3 border border-neutral-200 rounded-lg px-5 py-4">
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 mt-0.5">
                {ep.method}
              </span>
              <div>
                <p className="font-mono text-sm text-neutral-800">{ep.path}</p>
                <p className="text-sm text-neutral-500 mt-0.5">{ep.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="prose max-w-none">
          <p className="mt-4">
            Para la especificación OpenAPI completa, detalles de endpoints y esquemas de respuesta:{' '}
            <Link to="/developers" className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              Documentación de la API            </Link>
          </p>

          {/* Comparison */}
          <h2 className="section-heading mt-10">Cómo se compara con otras APIs de noticias</h2>
          <div className="mt-4 mb-4">
            <ComparisonTable
              headers={COMPARISON_HEADERS}
              rows={COMPARISON_ROWS}
              highlightColumn={0}
            />
          </div>
          <p>
            <Link to="/compare" className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              Ver cómo nos comparamos con otros servicios de noticias            </Link>
          </p>

          {/* RSS Feeds */}
          <h2 className="section-heading mt-10">Feeds RSS</h2>
          <p>
            ¿Prefieres RSS? Publicamos feeds por área temática. Agrégalos a cualquier lector RSS,
            úsalos en flujos de automatización (Zapier, n8n, IFTTT) o construye tu propia integración.
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-3 font-mono text-sm">
            <li>
              Desarrollo Humano:{' '}
              <span className="text-brand-800">
                {API_BASE}/feed?issueSlug=human-development
              </span>
            </li>
            <li>
              Planeta y Clima:{' '}
              <span className="text-brand-800">
                {API_BASE}/feed?issueSlug=planet-climate
              </span>
            </li>
            <li>
              Amenazas Existenciales:{' '}
              <span className="text-brand-800">
                {API_BASE}/feed?issueSlug=existential-threats
              </span>
            </li>
            <li>
              Ciencia y Tecnología:{' '}
              <span className="text-brand-800">
                {API_BASE}/feed?issueSlug=science-technology
              </span>
            </li>
          </ul>

          {/* Widgets */}
          <h2 className="section-heading mt-10">Widgets integrables</h2>
          <p>
            ¿Quieres mostrar noticias curadas directamente en tu sitio web? Usa nuestro generador
            de widgets para crear un widget de noticias personalizable — sin necesidad de backend.
          </p>
          <p className="mt-2">
            <Link to="/widgets" className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              Crear un widget
            </Link>
          </p>
        </div>

        {/* CTA */}
        <section className="mt-16 pt-10 border-t border-neutral-200 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Empieza a construir con noticias curadas.
          </h2>
          <p className="text-lg text-neutral-600 mb-8 max-w-xl mx-auto">
            Sin registro, sin clave, sin coste. Llama a la API y descubre lo que obtienes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/developers"
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 text-white font-medium rounded-lg hover:bg-brand-800 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Leer la documentación de la API            </Link>
            <a
              href={`${API_BASE}/stories`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border border-brand-700 text-brand-800 font-medium rounded-lg hover:bg-brand-50 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Probarlo ahora: /api/stories              <span className="sr-only">(se abre en nueva pestaña)</span>
            </a>
          </div>
        </section>
      </div>
    </>
  )
}
