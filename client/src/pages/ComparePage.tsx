import { type ReactNode, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import StructuredData from '../components/StructuredData'
import LandingCta from '../components/LandingCta'
import { publicApi } from '../lib/api'
import type { RegionStat, ComparisonStats } from '../lib/api'

const META = {
  title: 'Comparar fuentes de noticias \u2014 Impacto Ind\u00edgena',
  description:
    'Comparación directa entre Google News, Flipboard, Ground News, News Minimalist y más. Descubre cómo se diferencian en curación por IA, privacidad, transparencia de fuentes y coste.',
  url: `${SEO.siteUrl}/compare`,
}

const COMPETITORS = ['Google News', 'Flipboard', 'Ground News', 'News Minimalist', 'Feedly', 'SmartNews']

type CellValue = string | { text: string; check?: boolean }

function getCellText(cell: CellValue): string {
  return typeof cell === 'string' ? cell : cell.text
}

function getCellCheck(cell: CellValue): boolean {
  return typeof cell !== 'string' && !!cell.check
}

function CellContent({ cell }: { cell: CellValue }) {
  const text = getCellText(cell)
  const check = getCellCheck(cell)
  return (
    <>
      {check && (
        <svg
          className="inline-block w-4 h-4 text-green-600 mr-1 -mt-0.5 shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {text}
    </>
  )
}

// Each row: us = Impacto Indígena cell, them = one cell per competitor (same order as COMPETITORS)
// Sources: pm/references/marketing/competitors/*.md
const ROWS: { us: CellValue; them: CellValue[] }[] = [
  {
    us: { text: 'Curación por IA en múltiples etapas', check: true },
    them: [
      'Personalización ML por interés y ubicación',
      'Híbrido humano + IA, 20 curadores',
      'Agrupación de notas + clasificación de sesgos de terceros',
      { text: 'Puntuación de relevancia con GPT-4', check: true },
      'Asistente Leo IA (solo Pro+, $8.25/mes)',
      'IA + editores humanos',
    ],
  },
  {
    us: { text: 'Solo lo que importa a la humanidad', check: true },
    them: [
      'General, personalizado por comportamiento del usuario',
      'Más de 30.000 temas, con mucho contenido de estilo de vida',
      'General con foco en sesgo/perspectiva',
      'General, filtrado por relevancia',
      'Definido por el usuario (cualquier fuente RSS)',
      'Noticias generales + locales',
    ],
  },
  {
    us: { text: 'Todas las fuentes nombradas públicamente', check: true },
    them: [
      'Fuentes nombradas, algoritmo propietario',
      'Fuentes nombradas, lista de editores no pública',
      { text: 'Clasificaciones de sesgo de AllSides / Ad Fontes / MBFC', check: true },
      { text: 'Fuentes nombradas, criterios de puntuación públicos', check: true },
      { text: 'El usuario selecciona todas las fuentes', check: true },
      'Fuentes nombradas, algoritmo propietario',
    ],
  },
  {
    us: { text: 'Sin publicidad', check: true },
    them: [
      { text: 'Sin publicidad en el feed', check: true },
      'Publicidad nativa en el feed',
      { text: 'Sin publicidad (financiado por suscripción)', check: true },
      { text: 'Sin publicidad', check: true },
      { text: 'Sin publicidad (freemium)', check: true },
      'Publicidad nativa + video',
    ],
  },
  {
    us: { text: 'Sin rastreo', check: true },
    them: [
      'Cuenta Google + rastreo entre productos',
      'Datos del dispositivo + segmentación publicitaria',
      'Basado en cuenta, detalles limitados públicos',
      'Plataforma de newsletter incluye píxeles publicitarios',
      'Analítica SaaS estándar',
      'Rastreo entre dispositivos + geolocalización',
    ],
  },
  {
    us: { text: 'Resumen IA para cada noticia', check: true },
    them: [
      'Titulares + fragmentos',
      'Titulares + vistas previas con imagen',
      'Titulares de múltiples fuentes + análisis de sesgo',
      { text: 'Resumen breve + puntuación de relevancia ($15/mes para versión extendida)', check: true },
      'Resúmenes vía Leo (solo de pago)',
      'Titulares + fragmentos',
    ],
  },
  {
    us: { text: 'Análisis de relevancia multifactor', check: true },
    them: [
      'Clasificación propietaria, sin puntuación pública',
      'Sin puntuación pública',
      'Volumen de cobertura + puntuación de sesgo',
      { text: 'Puntuación de relevancia 0\u201310 (4 criterios)', check: true },
      'Priorización Leo (de pago, entrenado por el usuario)',
      'Sin puntuación pública',
    ],
  },
  {
    us: { text: 'API gratuita, sin clave requerida', check: true },
    them: [
      'Cerrado en 2011',
      'No',
      'No',
      'No',
      'API de desarrollo limitada (250 solicitudes)',
      'Solo API para anunciantes',
    ],
  },
  {
    us: { text: 'Feeds RSS', check: true },
    them: [
      'No oficial, sin soporte',
      { text: 'RSS de revistas disponible', check: true },
      { text: 'Vía Open RSS', check: true },
      { text: 'Vía plataforma de newsletter', check: true },
      'No aplica (es un lector RSS)',
      'No',
    ],
  },
  {
    us: { text: 'Metodología publicada', check: true },
    them: [
      'Solo principios generales',
      'Solo publicaciones de blog generales',
      { text: 'Metodología de clasificación de sesgos documentada', check: true },
      { text: 'Criterios de puntuación + umbral documentados', check: true },
      'Funciones de Leo documentadas, algoritmos no',
      'Sin documentar',
    ],
  },
]

const DIFFERENTIATORS: { icon: ReactNode; title: string; description: string; border: string }[] = [
  {
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
    title: 'Relevancia sobre engagement',
    description:
      'La IA selecciona entre 10\u201320 noticias diarias por importancia real, no por potencial de clics.',
    border: 'border-l-brand-400',
  },
  {
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Cobertura global',
    description:
      'Más de 82 fuentes en cinco idiomas, incluidas regiones que la mayoría de los agregadores ignora.',
    border: 'border-l-teal-400',
  },
  {
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
      </svg>
    ),
    title: 'Sin publicidad, sin rastreo',
    description:
      'Sin anuncios, sin cookies, sin rastreadores de terceros. Solo analítica con privacidad como prioridad.',
    border: 'border-l-amber-400',
  },
  {
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    title: 'Sin ánimo de lucro',
    description:
      'Financiado por donaciones, sin inversores, sin métricas de engagement. Creado para informar, no para monetizar.',
    border: 'border-l-indigo-400',
  },
]

const PERSONAS: { title: string; description: string; link: string; linkText: string; border: string }[] = [
  {
    title: 'Lectores con fatiga informativa',
    description: 'Menos noticias, pero mejores, en lugar de un scroll interminable.',
    link: '/news-fatigue',
    linkText: 'Nuestra propuesta',
    border: 'border-l-brand-400',
  },
  {
    title: 'Desarrolladores y organizaciones',
    description: 'Datos de noticias curadas sin necesidad de construir tu propio pipeline.',
    link: '/free-api',
    linkText: 'Explora la API gratuita',
    border: 'border-l-teal-400',
  },
  {
    title: 'Lectores preocupados por su privacidad',
    description: 'Sin publicidad, sin rastreo, sin recolección de datos.',
    link: '/no-ads-no-tracking',
    linkText: 'Nuestro compromiso',
    border: 'border-l-amber-400',
  },
  {
    title: 'Lectores con visión global',
    description: 'Cobertura más allá de los titulares occidentales.',
    link: '/methodology',
    linkText: 'Fuentes y metodología',
    border: 'border-l-indigo-400',
  },
]

const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: META.title,
  description: 'Comparación directa entre agregadores de noticias: Google News, Flipboard, Ground News y más.',
  url: META.url,
  mainEntity: {
    '@type': 'Table',
    about: 'Comparación de agregadores de noticias',
  },
}

const breadcrumb = buildBreadcrumbSchema([
  { name: 'Inicio', url: SEO.siteUrl },
  { name: 'Comparar', url: META.url },
])

export default function ComparePage() {
  const [competitor, setCompetitor] = useState('Google News')
  const idx = COMPETITORS.indexOf(competitor)

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
        <h1 className="page-title">¿Cómo se compara Impacto Indígena?</h1>
        <p className="text-lg text-neutral-600 leading-relaxed">
          La mayoría de los agregadores de noticias optimizan para el engagement: más clics, más
          tiempo en el sitio, más impresiones publicitarias. Impacto Indígena hace algo distinto:
          usa IA para encontrar las noticias que más importan a la humanidad, sin publicidad, sin
          rastreo y con plena transparencia de fuentes.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
          {DIFFERENTIATORS.map((card) => (
            <div
              key={card.title}
              className={`bg-white border border-neutral-200 ${card.border} border-l-4 rounded-lg p-5`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-neutral-500">{card.icon}</span>
                <p className="font-bold text-neutral-800">{card.title}</p>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">{card.description}</p>
            </div>
          ))}
        </div>

        {/* Comparison table — 2-column, AR vs selected competitor */}
        <h2 className="section-heading mt-12">Comparación directa</h2>
        <table className="w-full text-sm border-collapse mt-6 table-fixed">
          <thead>
            <tr>
              <th className="w-1/2 text-left py-3 px-4 font-bold bg-brand-50 text-brand-800 border-b border-brand-200 rounded-tl-lg">
                Impacto Indígena
              </th>
              <th className="w-1/2 text-left py-3 px-4 font-bold bg-neutral-50 text-neutral-700 border-b border-neutral-300 rounded-tr-lg">
                <select
                  value={competitor}
                  onChange={(e) => setCompetitor(e.target.value)}
                  className="font-bold text-sm bg-transparent text-neutral-700 border-none outline-none cursor-pointer underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                  aria-label="Seleccionar fuente para comparar"
                >
                  {COMPETITORS.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                <td className="py-2.5 px-4 border-b border-neutral-200 text-neutral-800 font-medium">
                  <CellContent cell={row.us} />
                </td>
                <td className="py-2.5 px-4 border-b border-neutral-200 text-neutral-600">
                  <CellContent cell={row.them[idx]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-neutral-400 mt-2">A febrero de 2026.</p>

        {/* Who We're Best For — colored cards */}
        <h2 className="section-heading mt-12">Para quién es Impacto Indígena</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {PERSONAS.map((card) => (
            <div
              key={card.title}
              className={`bg-white border border-neutral-200 ${card.border} border-l-4 rounded-lg p-5`}
            >
              <h3 className="font-bold text-neutral-800 mb-1">{card.title}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                {card.description}{' '}
                <Link to={card.link} className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                  {card.linkText}
                </Link>
              </p>
            </div>
          ))}
        </div>

        <ComparisonSection />

        <CoverageSection />

        <LandingCta
          heading="¿Listo para leer noticias que realmente importan?"
          description="Visita impactoindigena.news o suscríbete al boletín para recibir un resumen seleccionado editorialmente en tu bandeja de entrada."
        />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Comparison section — indigenous vs mainstream relevance
// ---------------------------------------------------------------------------

function ComparisonBar({
  indigenous,
  mainstream,
}: {
  indigenous: number | null
  mainstream: number | null
}) {
  const max = 10
  const indPct = indigenous != null ? Math.round((indigenous / max) * 100) : 0
  const mainPct = mainstream != null ? Math.round((mainstream / max) * 100) : 0

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-xs text-neutral-600 mb-1">
          <span className="font-medium">Medios indígenas y de derechos humanos</span>
          <span className="font-semibold text-brand-700">
            {indigenous != null ? indigenous.toFixed(1) : '—'}/10
          </span>
        </div>
        <div className="h-3 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-700"
            style={{ width: `${indPct}%` }}
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-neutral-600 mb-1">
          <span className="font-medium">Medios internacionales (BBC, DW, Le Monde…)</span>
          <span className="font-semibold text-neutral-500">
            {mainstream != null ? mainstream.toFixed(1) : '—'}/10
          </span>
        </div>
        <div className="h-3 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-neutral-400 transition-all duration-700"
            style={{ width: `${mainPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function ComparisonSection() {
  const { data, isLoading, isError } = useQuery<ComparisonStats>({
    queryKey: ['coverage-comparison'],
    queryFn: () => publicApi.coverageComparison(),
    staleTime: 60 * 60 * 1000,
  })

  const hasData =
    !isLoading &&
    !isError &&
    data != null &&
    (data.indigenous.storyCount > 0 || data.mainstream.storyCount > 0)

  // Don't render the section until mainstream feeds have produced data
  if (!hasData && !isLoading) return null

  return (
    <section className="mt-16">
      <h2 className="section-heading">Relevancia real: indígena vs. internacional</h2>
      <p className="text-neutral-600 mt-2 mb-8 text-sm leading-relaxed max-w-2xl">
        La misma IA que puntúa las noticias de Impacto Indígena también analiza medios como BBC,
        Al Jazeera o Der Spiegel. El resultado muestra cuánto priorizan las voces indígenas en
        su cobertura global. Puntuación media de relevancia indígena sobre{' '}
        {data?.periodDays ?? 30} días.
      </p>

      {isLoading && (
        <div className="space-y-4">
          <div className="h-8 rounded-lg bg-neutral-100 animate-pulse w-3/4" />
          <div className="h-8 rounded-lg bg-neutral-100 animate-pulse w-2/3" />
        </div>
      )}

      {hasData && (
        <>
          <ComparisonBar
            indigenous={data.indigenous.avgRelevance}
            mainstream={data.mainstream.avgRelevance}
          />

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-brand-50 border border-brand-100 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-brand-700 tabular-nums">
                {data.indigenous.avgRelevance?.toFixed(1) ?? '—'}
              </p>
              <p className="text-xs text-brand-600 mt-1">Relevancia media — medios indígenas</p>
              <p className="text-xs text-neutral-400 mt-0.5">{data.indigenous.storyCount} noticias · {data.indigenous.feedCount} fuentes</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-neutral-500 tabular-nums">
                {data.mainstream.avgRelevance?.toFixed(1) ?? '—'}
              </p>
              <p className="text-xs text-neutral-500 mt-1">Relevancia media — medios internacionales</p>
              <p className="text-xs text-neutral-400 mt-0.5">{data.mainstream.storyCount} noticias · {data.mainstream.feedCount} fuentes</p>
            </div>
          </div>

          <p className="text-xs text-neutral-400 mt-3">
            Puntuación 1–10 por IA: relevancia para pueblos indígenas, derechos y territorio.
            Últimos {data.periodDays} días.
          </p>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Coverage stats section
// ---------------------------------------------------------------------------

function RelevanceBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.round((value / max) * 100)
  const color = value >= 6.5 ? 'bg-brand-600' : value >= 5 ? 'bg-amber-400' : 'bg-neutral-300'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-neutral-700 w-8 text-right">{value.toFixed(1)}</span>
    </div>
  )
}

function CoverageSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['coverage-stats'],
    queryFn: () => publicApi.coverage(),
    staleTime: 60 * 60 * 1000,
  })

  const rows = data?.byRegion.filter((r: RegionStat) => r.storyCount > 0) ?? []

  return (
    <section className="mt-16">
      <h2 className="section-heading">Cobertura por región</h2>
      <p className="text-neutral-600 mt-2 mb-6 text-sm leading-relaxed max-w-2xl">
        Impacto Indígena indexa {data?.totalFeeds ?? '—'} fuentes activas en {rows.length} regiones.
        Las puntuaciones de relevancia promedio reflejan qué tan bien cubre cada región los temas indígenas
        y de derechos humanos: puntuaciones más altas indican una cobertura más enfocada y sustantiva.
      </p>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-neutral-100 animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-neutral-400 italic">Datos de cobertura temporalmente no disponibles.</p>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">Región</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wide w-20">Fuentes</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wide w-24">Noticias (30d)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide w-48">Relevancia media</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: RegionStat) => (
                  <tr key={row.region} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-800">{row.label}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">{row.feedCount}</td>
                    <td className="px-4 py-3 text-right text-neutral-700 font-medium">{row.storyCount}</td>
                    <td className="px-4 py-3">
                      {row.avgRelevance != null
                        ? <RelevanceBar value={row.avgRelevance} />
                        : <span className="text-neutral-300 text-xs">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-400 mt-2">
            Relevancia puntuada del 1 al 10 por IA en temas indígenas y de derechos humanos. Últimos {data?.periodDays} días.
          </p>
        </>
      )}
    </section>
  )
}
