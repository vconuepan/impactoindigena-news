import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import StructuredData from '../components/StructuredData'
import LandingCta from '../components/LandingCta'
import { getCategoryColor } from '../lib/category-colors'

const META = {
  title: 'El Cansancio Informativo Es un Problema de Diseño — Hay una Mejor Manera | Impacto Indígena',
  description:
    'Casi el 40% de las personas evita activamente las noticias. El problema no eres tú — es cómo se entregan. Un resumen curado de las historias que importan, sin ruido.',
  url: `${SEO.siteUrl}/news-fatigue`,
}

const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'El Cansancio Informativo Es un Problema de Diseño — Hay una Mejor Manera',
  description: META.description,
  url: META.url,
  author: {
    '@type': 'Organization',
    name: 'Impacto Indígena',
    url: SEO.siteUrl,
  },
  about: [
    { '@type': 'Thing', name: 'Cansancio informativo' },
    { '@type': 'Thing', name: 'Evitar las noticias' },
    { '@type': 'Thing', name: 'Alfabetización mediática' },
  ],
}

const breadcrumb = buildBreadcrumbSchema([
  { name: 'Inicio', url: SEO.siteUrl },
  { name: 'Cansancio Informativo', url: META.url },
])

const PROBLEM_CARDS = [
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    title: 'Sobrecarga de volumen',
    description: 'Cientos de historias por día, la mayoría son ruido. Sin señal clara, sin punto de parada.',
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
      </svg>
    ),
    title: 'Sesgo hacia lo negativo',
    description: 'La indignación y el miedo generan clics. El progreso y la complejidad, no.',
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Scroll infinito',
    description: 'Sin punto de parada natural. O te pierdes en el abismo del scroll o te fuerzas a cerrar la pantalla.',
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    title: 'El ciclo de culpa',
    description: 'Evitas las noticias → te sientes desinformado/a → lo vuelves a intentar → te abrumas → repites.',
  },
]

const APPROACH_CARDS = [
  {
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
    title: 'Menos historias, más relevantes',
    description:
      'La IA analiza 82+ fuentes y selecciona 10–20 historias por su importancia real. Sin relleno, sin cebo emocional.',
    border: 'border-l-brand-400',
  },
  {
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Un punto de parada natural',
    description:
      'Cuando has leído las historias curadas del día, terminaste. Sin feed infinito, sin espirales algorítmicas. Te informas y sigues con tu vida.',
    border: 'border-l-teal-400',
  },
  {
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    title: 'El control de tono emocional',
    description:
      'Un selector de 5 posiciones te permite filtrar historias por tono emocional. Tú decides lo que ves, no un algoritmo.',
    border: 'border-l-amber-400',
  },
  {
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Perspectiva indígena',
    description:
      'En lugar de las mismas narrativas dominantes repetidas en todos lados, aquí encontrarás reportajes desde comunidades y medios indígenas de toda América.',
    border: 'border-l-indigo-400',
  },
]

const ISSUE_CARDS = [
  {
    slug: 'cambio-climatico',
    title: 'Cambio Climático',
    description: 'Impactos ambientales en territorios indígenas, defensores de la tierra, crisis hídrica',
  },
  {
    slug: 'derechos-indigenas',
    title: 'Derechos Indígenas',
    description: 'Consulta previa, CLPI, autodeterminación, derechos territoriales',
  },
  {
    slug: 'chile-indigena',
    title: 'Chile Indígena',
    description: 'Conflicto mapuche, pueblos originarios de Chile, política indígena nacional',
  },
]

export default function NewsFatiguePage() {
  return (
    <>
      <Helmet>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={META.url} />
        {CommonOgTags({})}
      </Helmet>
      <StructuredData data={[pageSchema, breadcrumb]} />

      <div className="page-section">
        <h1 className="page-title">No Evitas las Noticias Porque No Te Importa</h1>
        <div className="prose max-w-none">
          <p className="text-lg text-neutral-600 leading-relaxed">
            Te importa el mundo. El cambio climático, los derechos indígenas, los conflictos que afectan a
            millones — sabes que estas cosas importan. Pero cada vez que abres una app de noticias, te encuentras
            con paredes de indignación, clickbait y un algoritmo diseñado para mantenerte enganchado/a. Así que
            la cierras. Y luego te sientes culpable por no estar informado/a.
          </p>
          <p>
            No estás solo/a. Según el{' '}
            <a href="https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2024" target="_blank" rel="noopener noreferrer">
              Instituto Reuters
            </a>
            , casi el 40% de las personas evita activamente las noticias. No porque sean apáticas —
            sino porque la forma en que se entregan las noticias es agotadora.
          </p>
        </div>

        {/* El Problema — cuadrícula 2x2 */}
        <h2 className="section-heading mt-10">
          El Problema No Son las Noticias. Es la Forma de Entregarlas.
        </h2>
        <p className="text-neutral-600 mt-2 leading-relaxed">
          Las plataformas de noticias tradicionales venden publicidad, lo que significa que necesitan tu
          atención, lo que significa que necesitan provocar reacciones emocionales. El resultado:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {PROBLEM_CARDS.map((card) => (
            <div
              key={card.title}
              className="bg-neutral-50 rounded-xl border border-neutral-200 p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-neutral-500">{card.icon}</span>
                <h3 className="font-bold text-neutral-800">{card.title}</h3>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">{card.description}</p>
            </div>
          ))}
        </div>

        {/* Un Enfoque Diferente — tarjetas de características */}
        <h2 className="section-heading mt-12">Un Enfoque Diferente</h2>
        <p className="text-neutral-600 mt-2 leading-relaxed">
          Impacto Indígena se construye en torno a una idea simple: ¿qué pasaría si pudieras mantenerte
          informado/a sobre lo que importa sin el ruido?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {APPROACH_CARDS.map((card) => (
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

        {/* Cómo Mantenerse Informado */}
        <h2 className="section-heading mt-12">Infórmate en 5 Minutos</h2>
        <p className="text-neutral-600 mt-3 leading-relaxed">
          Abre Impacto Indígena o el boletín. Revisa 10–20 historias curadas organizadas por
          área temática. Lee las que te interesen — cada una enlaza a la fuente original. Listo.
          Cinco minutos, y estás genuinamente informado/a sobre lo que pasó hoy.
        </p>

        {/* Construido para Quienes les Importa — tarjetas de temas */}
        <h2 className="section-heading mt-12">Construido para Quienes les Importa</h2>
        <p className="text-neutral-600 mt-2 leading-relaxed">
          Nos enfocamos en áreas temáticas que definen la realidad indígena de nuestro tiempo, omitiendo
          deliberadamente noticias de farándula, deporte, bolsa y comentario partidista. Si estas son
          las cosas que te preocupan cuando evitas las noticias, este es el resumen para ti.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {ISSUE_CARDS.map((card) => {
            const colors = getCategoryColor(card.slug)
            return (
              <Link
                key={card.slug}
                to={`/issues/${card.slug}`}
                className="block bg-white border border-neutral-200 border-t-4 rounded-lg p-5 hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-brand-500 no-underline"
                style={{ borderTopColor: colors.hex }}
              >
                <h3 className="font-bold text-neutral-800 mb-1">{card.title}</h3>
                <p className="text-sm text-neutral-600">{card.description}</p>
              </Link>
            )
          })}
        </div>

        {/* Sin Trucos, Sin Trampas */}
        <h2 className="section-heading mt-12">Sin Trucos, Sin Trampas</h2>
        <div className="prose max-w-none">
          <ul className="list-disc pl-6 space-y-2 mt-3">
            <li>
              <strong>Sin publicidad.</strong> No hay ingresos que dependan de mantenerte enganchado/a.{' '}
              <Link to="/no-ads-no-tracking" className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                Lee nuestro compromiso
              </Link>
            </li>
            <li>
              <strong>Sin rastreo.</strong> Sin cookies, sin perfiles de análisis, sin rastreadores de terceros.
            </li>
            <li>
              <strong>Sin burbujas de personalización.</strong> Todo el mundo ve las mismas historias curadas.
            </li>
            <li>
              <strong>No comercial.</strong> Este es un proyecto de bien social, no un negocio mediático.
            </li>
          </ul>
          <p className="mt-4">
            <Link to="/methodology" className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              Cómo seleccionamos las historias
            </Link>
          </p>
        </div>

        <LandingCta
          heading="Infórmate sin el agotamiento."
          description="Visita impactoindigena.news para las historias de hoy — o recibe el resumen en tu bandeja de entrada."
        />
      </div>
    </>
  )
}
