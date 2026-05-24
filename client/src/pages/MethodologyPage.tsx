import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import StructuredData from '../components/StructuredData'
import LandingCta from '../components/LandingCta'
import { useSources } from '../hooks/useSources'
import { getCategoryColor } from '../lib/category-colors'

const META = {
  title: 'Metodologia \u2014 Como la IA cura las noticias | Impacto Indigena',
  description:
    'Fuentes especializadas, un pipeline de IA en multiples etapas y total transparencia. Aprende exactamente como Impacto Indigena selecciona las noticias mas relevantes para los pueblos indigenas.',
  url: `${SEO.siteUrl}/methodology`,
}

const techArticleSchema = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'Metodologia \u2014 Como la IA cura las noticias',
  description:
    'Explicacion detallada del pipeline de curation de noticias con IA de Impacto Indigena, cubriendo fuentes especializadas en pueblos indigenas de todo el mundo.',
  url: META.url,
  author: {
    '@type': 'Organization',
    name: 'Impacto Indigena',
    url: SEO.siteUrl,
  },
  about: [
    { '@type': 'Thing', name: 'Curación de noticias con IA' },
    { '@type': 'Thing', name: 'Transparencia algorítmica' },
    { '@type': 'Thing', name: 'Pueblos indigenas' },
  ],
}

const breadcrumb = buildBreadcrumbSchema([
  { name: 'Inicio', url: SEO.siteUrl },
  { name: 'Metodologia', url: META.url },
])

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  )
}

export default function MethodologyPage() {
  const { data: sources, isLoading: sourcesLoading } = useSources()
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
      <StructuredData data={[techArticleSchema, breadcrumb]} />

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">Metodología</span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            Cómo la IA cura<br className="hidden md:block" /> las noticias
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Fuentes especializadas, un pipeline de IA en múltiples etapas y total transparencia.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-none">
          <h2 className="section-heading mt-8">Que significa "impacto" para nosotros?</h2>
          <p>
            Solo publicamos noticias que tienen importancia real para los pueblos indigenas del mundo
            y su futuro a largo plazo. La mayoria de los medios enfocan las noticias sobre pueblos
            indigenas desde una perspectiva de vulnerabilidad. Nosotros filtramos por noticias que
            documentan contribuciones, avances, derechos, conocimiento ancestral y colaboracion
            entre lo indigena y lo moderno.
          </p>

          <h2 className="section-heading mt-8">Nuestro Proceso</h2>
          <p>Usamos inteligencia artificial para encontrar las noticias mas relevantes:</p>

          <div className="my-6">
            <div className="flex items-center gap-1.5 justify-end mb-4 text-xs text-neutral-400">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-800 shrink-0" aria-hidden="true" />
              <span>= noticia</span>
            </div>

            <div>
              {[
                {
                  label: 'Recoleccion',
                  desc: sources
                    ? `Monitoreamos ${sources.totalCount} fuentes de noticias especializadas en pueblos indigenas de todo el mundo, en multiples idiomas y cuatro areas tematicas. El contenido se extrae automaticamente desde feeds RSS y sitios web especializados.`
                    : 'Monitoreamos fuentes especializadas en pueblos indigenas de todo el mundo, en multiples idiomas y cuatro areas tematicas. El contenido se extrae automaticamente desde feeds RSS y sitios web especializados.',
                  dots: 20,
                },
                {
                  label: 'Pre-evaluacion',
                  desc: 'Un modelo de lenguaje lee cada articulo y hace una primera evaluacion: tiene relevancia directa para los pueblos indigenas, su historia, cultura, territorio o derechos? Los articulos que no superan el umbral son filtrados automaticamente.',
                  dots: 10,
                },
                {
                  label: 'Analisis completo',
                  desc: 'Identificamos el tema al que pertenece la noticia, evaluamos su relevancia para los pueblos indigenas, asignamos una calificacion y generamos un resumen. Las calificaciones consideran factores como escala de impacto, implicaciones legales o politicas, y contribuciones al conocimiento indigena.',
                  dots: 4,
                },
                {
                  label: 'Comparacion y seleccion',
                  desc: 'Comparamos las noticias entre si y seleccionamos las mas relevantes para publicacion, priorizando diversidad tematica y geografica.',
                  dots: 2,
                },
                {
                  label: 'Publicacion',
                  desc: 'Las noticias seleccionadas se publican en el sitio con su analisis completo, cita clave y resumen de relevancia.',
                  dots: 1,
                },
              ].map((step) => (
                <div key={step.label} className="flex gap-4 md:gap-6 items-center py-3">
                  <div className="flex-1">
                    <strong className="text-neutral-800">{step.label}</strong>
                    <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{step.desc}</p>
                  </div>
                  <div
                    className="w-16 md:w-20 shrink-0 flex flex-wrap justify-end gap-[5px]"
                    role="img"
                    aria-label={`~${step.dots} noticias restantes`}
                  >
                    {Array.from({ length: step.dots }).map((_, j) => (
                      <span
                        key={j}
                        className="w-2.5 h-2.5 rounded-full bg-brand-800"
                        style={{ opacity: 0.25 + 0.75 * (1 - step.dots / 20) }}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <h2 className="section-heading mt-8">Cuatro Temas Principales</h2>
          <p>
            Cubrimos cuatro areas tematicas, cada una con criterios de evaluacion adaptados al
            contexto indigena especifico.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {[
            { slug: 'cambio-climatico', title: 'Cambio Climático y Biodiversidad', description: 'Territorios indígenas, medio ambiente, biodiversidad, acción climática' },
            { slug: 'derechos-indigenas', title: 'Derechos de los Pueblos Indígenas', description: 'Derechos territoriales, autodeterminación, reconocimiento legal, derechos humanos' },
            { slug: 'desarrollo-sostenible-y-autodeterminado', title: 'Empresas Indígenas', description: 'Economías indígenas, emprendimiento, gobernanza propia, educación intercultural' },
          ].map((card) => {
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
        <div className="prose max-w-none">

          <h2 className="section-heading mt-10">Nuestras Fuentes</h2>
          <p>
            Monitoreamos{sources ? ` ${sources.totalCount}` : ''} publicaciones especializadas. Cada
            fuente es seleccionada por su calidad editorial, cobertura regional o experiencia en
            asuntos indigenas, no por volumen de trafico.
          </p>

          {sourcesLoading ? (
            <div className="space-y-3 mt-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-5 bg-neutral-100 rounded animate-pulse" />
              ))}
            </div>
          ) : sources ? (
            <div className="mt-6 space-y-2">
              <Disclosure as="div" className="border border-neutral-200 rounded-lg">
                <DisclosureButton className="flex w-full items-center justify-between px-5 py-4 text-left font-bold text-neutral-800 hover:bg-neutral-50 transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-brand-500">
                  Por Region
                  <ChevronIcon className="w-5 h-5 text-neutral-400 data-[open]:rotate-180 transition-transform shrink-0" />
                </DisclosureButton>
                <DisclosurePanel className="px-5 pb-4 space-y-2">
                  {Object.entries(sources.byRegion).map(([region, names]) => (
                    <p key={region} className="text-sm">
                      <strong>{region}:</strong> {(names as string[]).join(', ')}
                    </p>
                  ))}
                </DisclosurePanel>
              </Disclosure>

              <Disclosure as="div" className="border border-neutral-200 rounded-lg">
                <DisclosureButton className="flex w-full items-center justify-between px-5 py-4 text-left font-bold text-neutral-800 hover:bg-neutral-50 transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-brand-500">
                  Por Tema
                  <ChevronIcon className="w-5 h-5 text-neutral-400 data-[open]:rotate-180 transition-transform shrink-0" />
                </DisclosureButton>
                <DisclosurePanel className="px-5 pb-4 space-y-2">
                  {Object.entries(sources.byIssue).map(([issue, names]) => (
                    <p key={issue} className="text-sm">
                      <strong>{issue}</strong> — {(names as string[]).join(', ')}
                    </p>
                  ))}
                </DisclosurePanel>
              </Disclosure>
            </div>
          ) : null}

          <h2 className="section-heading mt-10">Lo que NO hacemos</h2>
          <ul className="list-disc pl-6 space-y-2 mt-3">
            <li>
              <strong>No personalizamos.</strong> Todos ven las mismas noticias. No hay burbuja de
              filtro.
            </li>
            <li>
              <strong>No optimizamos para clics.</strong> Ningun metrica de engagement influye en la
              seleccion.
            </li>
            <li>
              <strong>No hacemos reporteria original.</strong> Cada noticia enlaza al articulo
              original. Los resumenes y analisis son generados por IA y claramente etiquetados como
              tal.
            </li>
            <li>
              <strong>No vendemos datos.</strong> Sin rastreo, sin perfiles de analitica, sin
              publicidad.
            </li>
          </ul>

          <h2 className="section-heading mt-10">El Filtro Emocional</h2>
          <p>
            Los lectores pueden ajustar un control de 5 posiciones que filtra las noticias por tono
            emocional. Esto no cambia lo que seleccionamos — te permite controlar cuanta noticias
            dificiles ves en una sesion. Es una herramienta para manejar la fatiga informativa, no
            un filtro editorial.
          </p>

          <h2 className="section-heading mt-10">Transparencia</h2>
          <p>
            Para cada noticia publicada, mostramos el analisis generado por IA: por que importa la
            noticia, que factores contribuyeron a su calificacion y posibles consideraciones.
            Creemos que los lectores merecen entender no solo <em>que</em> es relevante, sino
            <em> por que</em>.
          </p>
          <p className="mt-4">
            La curation con IA solo es confiable si puedes verificarla. Nombramos nuestras fuentes
            y explicamos nuestro pipeline con total transparencia.
          </p>
        </div>

          <h2 className="section-heading mt-10">Sobre este proyecto</h2>
          <p>
            Impacto Indigena News es una iniciativa de{' '}
            <a href="https://www.linkedin.com/in/vconuepan/" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700">
              Venancio Conuepan Mesias
            </a>
            , fundador de{' '}
            <a href="https://www.impactoindigena.com" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700">
              Impacto Indigena SpA
            </a>
            , la empresa matriz de esta plataforma. El prototipo fue desarrollado en el marco de la
            cohorte <strong>LatAm AI 2025</strong> de{' '}
            <a href="https://changemakerxchange.ai" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700">
              Changemakerxchange.ai
            </a>
            , una organizacion global que conecta y apoya a agentes de cambio que usan inteligencia
            artificial para resolver problemas sociales complejos.
          </p>
          <p className="mt-4">
            El desarrollo del prototipo fue acompanado por{' '}
            <a href="https://www.linkedin.com/in/odinmuehlenbein/" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700">
              Odin Muhlebein
            </a>
            , mentor de la cohorte LatAm AI 2025 de Changemakerxchange.ai y experto en inteligencia
            artificial del <strong>Ashoka AI Lab</strong>. A traves del Taller de Prototipos de IA,
            Odin acompaño a Venancio en transformar una vision clara — crear una plataforma que
            analice grandes volumenes de informacion y simplifique el acceso al conocimiento para
            lideres y comunidades indigenas — en una herramienta tangible y funcional.
          </p>
          <p className="mt-4">
            Este proyecto nace de la conviccion de que los pueblos indigenas son los primeros
            innovadores sociales de la humanidad, y que la inteligencia artificial puede ser un
            puente para amplificar su voz, su conocimiento y su liderazgo en la solucion de los
            desafios globales que nos afectan a todos.
          </p>

        <LandingCta
          heading="Miralo en accion."
          description="Visita impactoindigena.news para leer las noticias curadas de hoy, o suscribete al boletin semanal."
        />
      </div>
    </>
  )
}
