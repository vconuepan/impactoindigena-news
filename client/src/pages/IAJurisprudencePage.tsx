import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

const META = {
  title: 'Jurisprudencia indígena de la Corte IDH: casos clave | Impacto Indígena',
  description:
    'Índice de los fallos más importantes de la Corte Interamericana de Derechos Humanos sobre pueblos indígenas: derechos territoriales, consulta previa, recursos naturales y reparaciones.',
  url: `${SEO.siteUrl}/guia/jurisprudencia-interamericana`,
}

interface Case {
  name: string
  year: number
  country: string
  summary: string
  tags: string[]
}

const CASES: { topic: string; description: string; items: Case[] }[] = [
  {
    topic: 'Derechos territoriales',
    description:
      'Casos que establecieron que los pueblos indígenas tienen derecho a la propiedad colectiva de sus tierras ancestrales, independientemente de títulos formales.',
    items: [
      {
        name: 'Comunidad Mayagna (Sumo) Awas Tingni vs. Nicaragua',
        year: 2001,
        country: 'Nicaragua',
        summary:
          'Primer fallo que reconoce el derecho de propiedad colectiva sobre tierras ancestrales. La Corte estableció que la posesión tradicional equivale al título de propiedad y ordenó delimitar y titular el territorio de la comunidad.',
        tags: ['Territorialidad', 'Propiedad colectiva', 'Hito fundacional'],
      },
      {
        name: 'Comunidad Indígena Yakye Axa vs. Paraguay',
        year: 2005,
        country: 'Paraguay',
        summary:
          'La Corte determinó que el desplazamiento de la comunidad de sus tierras ancestrales vulneró su derecho a la vida digna. Obligó a Paraguay a devolver el territorio y garantizar condiciones mínimas de subsistencia durante el proceso.',
        tags: ['Territorialidad', 'Derecho a la vida', 'Paraguay'],
      },
      {
        name: 'Comunidad Indígena Sawhoyamaxa vs. Paraguay',
        year: 2006,
        country: 'Paraguay',
        summary:
          'Confirmó que el Estado no puede oponer el derecho de propiedad privada de terceros frente a los derechos territoriales indígenas cuando el territorio es ancestral. Estableció que la situación de extrema pobreza derivada del desplazamiento vulnera el derecho a la vida.',
        tags: ['Territorialidad', 'Derecho a la vida', 'Propiedad privada vs. derechos indígenas'],
      },
      {
        name: 'Pueblo Indígena Kichwa de Sarayaku vs. Ecuador',
        year: 2012,
        country: 'Ecuador',
        summary:
          'Ecuador permitió a una empresa petrolera realizar actividades de exploración en territorio Sarayaku sin consulta y depositando explosivos en zonas sagradas. La Corte ordenó retirar los explosivos, consultar antes de cualquier proyecto futuro y reparar el daño cultural.',
        tags: ['Territorialidad', 'Consulta previa', 'Recursos naturales', 'Explosivos en territorio sagrado'],
      },
      {
        name: 'Comunidades Indígenas Miembros de la Asociación Lhaka Honhat vs. Argentina',
        year: 2020,
        country: 'Argentina',
        summary:
          'El fallo más reciente y de mayor alcance ambiental. La Corte reconoció por primera vez el derecho a un medio ambiente sano, al agua y a la alimentación adecuada como derechos autónomos vinculados a los derechos territoriales indígenas. Ordenó al Estado detener las actividades que degradaban el territorio.',
        tags: ['Territorialidad', 'Medio ambiente', 'Derechos ambientales', 'Hito ambiental'],
      },
    ],
  },
  {
    topic: 'Consulta previa y recursos naturales',
    description:
      'Fallos que definen el alcance del deber de consultar y las condiciones bajo las cuales el Estado puede autorizar proyectos extractivos en territorios indígenas.',
    items: [
      {
        name: 'Pueblo Saramaka vs. Surinam',
        year: 2007,
        country: 'Surinam',
        summary:
          'Caso fundacional sobre recursos naturales. La Corte estableció que los grandes proyectos de desarrollo requieren no solo consulta sino consentimiento del pueblo afectado, y que el Estado debe compartir de forma equitativa los beneficios del proyecto. Definió las tres garantías del derecho a la propiedad colectiva en contextos extractivos.',
        tags: ['Consulta previa', 'CLPI', 'Recursos naturales', 'Hito extractivo'],
      },
      {
        name: 'Pueblo Indígena Xucuru vs. Brasil',
        year: 2018,
        country: 'Brasil',
        summary:
          'Brasil tardó más de 16 años en titular completamente el territorio Xucuru a pesar de haberlo reconocido. La Corte condenó la demora excesiva y los actos de violencia e intimidación contra miembros de la comunidad durante el proceso, estableciendo plazos concretos para completar la titulación.',
        tags: ['Territorialidad', 'Titulación', 'Plazo razonable'],
      },
      {
        name: 'Comunidades Garífuna de Triunfo de la Cruz vs. Honduras',
        year: 2015,
        country: 'Honduras',
        summary:
          'El Estado otorgó concesiones turísticas en territorio garífuna sin consulta previa y permitió el despojo de tierras por terceros. La Corte condenó la falta de consulta y el incumplimiento de la obligación de garantizar la propiedad colectiva frente a presiones privadas.',
        tags: ['Consulta previa', 'Territorialidad', 'Concesiones turísticas'],
      },
    ],
  },
  {
    topic: 'Violencia, masacres y desplazamiento',
    description:
      'Casos sobre violaciones masivas a derechos humanos que afectaron a comunidades indígenas, incluyendo masacres, desapariciones forzadas y desplazamiento.',
    items: [
      {
        name: 'Masacres de Río Negro vs. Guatemala',
        year: 2012,
        country: 'Guatemala',
        summary:
          'El Ejército de Guatemala perpetró entre 1980 y 1982 cinco masacres contra la comunidad maya achí de Río Negro, en el contexto de la construcción de la represa Chixoy. La Corte condenó al Estado por genocidio de hecho y ordenó reparaciones integrales, incluyendo la búsqueda de restos y medidas de no repetición.',
        tags: ['Masacre', 'Desplazamiento', 'Pueblos maya', 'Represa Chixoy'],
      },
      {
        name: 'Chitay Nech y otros vs. Guatemala',
        year: 2010,
        country: 'Guatemala',
        summary:
          'Desaparición forzada de Florencio Chitay Nech, líder indígena maya y concejal municipal, perpetrada por agentes del Estado durante el conflicto armado. La Corte reconoció la dimensión colectiva del daño: la eliminación de líderes indígenas busca desarticular la identidad y resistencia del pueblo.',
        tags: ['Desaparición forzada', 'Líderes indígenas', 'Conflicto armado'],
      },
      {
        name: 'Comunidades Afrodescendientes Desplazadas de la Cuenca del Río Cacarica (Operación Génesis) vs. Colombia',
        year: 2013,
        country: 'Colombia',
        summary:
          'Operación militar conjunta con grupos paramilitares provocó el desplazamiento masivo de comunidades afrodescendientes de la cuenca del Cacarica. La Corte extendió la protección de la propiedad colectiva y la identidad cultural a los pueblos tribales afrodescendientes, equiparándolos a los pueblos indígenas en el sistema interamericano.',
        tags: ['Desplazamiento forzado', 'Pueblos tribales', 'Afrodescendientes', 'Colombia'],
      },
    ],
  },
]

export default function IAJurisprudencePage() {
  return (
    <>
      <Helmet>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={META.url} />
        <link rel="canonical" href={META.url} />
        {CommonOgTags({})}
      </Helmet>

      <StructuredData
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'Jurisprudencia indígena de la Corte IDH: casos clave',
            description: META.description,
            url: META.url,
            author: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            publisher: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            about: [
              { '@type': 'Thing', name: 'Corte Interamericana de Derechos Humanos' },
              { '@type': 'Thing', name: 'Derechos de los pueblos indígenas' },
              { '@type': 'Thing', name: 'Jurisprudencia interamericana' },
            ],
          },
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Guías', url: `${SEO.siteUrl}/guia` },
            { name: 'Jurisprudencia Corte IDH' },
          ]),
        ]}
      />

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">
            Guía · Vertical jurídico
          </span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            Jurisprudencia indígena de la Corte IDH
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Los fallos que transformaron el derecho internacional indígena: territorio, consulta,
            recursos naturales y reparaciones.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="max-w-2xl mx-auto">

          <div className="prose max-w-none">
            <h2 className="section-heading mt-0">El sistema interamericano y los pueblos indígenas</h2>
            <p>
              La <strong>Corte Interamericana de Derechos Humanos</strong> (Corte IDH) es el
              tribunal regional con jurisdicción sobre los 20 Estados que han reconocido su
              competencia contenciosa. Sus fallos son vinculantes para esos países y generan
              lo que la propia Corte llama <em>res interpretata</em>: una interpretación que
              todos los Estados del sistema deben aplicar mediante el{' '}
              <strong>control de convencionalidad</strong>, incluso si no fueron parte del litigio.
            </p>
            <p>
              Desde el año 2001, la Corte IDH ha construido un corpus jurisprudencial robusto
              sobre derechos indígenas. Sus fallos han reconocido la propiedad colectiva territorial,
              el deber de consulta previa, el derecho al consentimiento libre y el vínculo entre
              territorio y cultura. Este índice reúne los casos más citados en la academia, en
              litigios nacionales y en la práctica de organizaciones indígenas de toda la región.
            </p>
          </div>

          {/* Cases by topic */}
          <div className="mt-10 space-y-10">
            {CASES.map((group) => (
              <div key={group.topic}>
                <h2 className="text-xl font-bold text-neutral-900 mb-2">{group.topic}</h2>
                <p className="text-sm text-neutral-500 mb-5 leading-relaxed">{group.description}</p>
                <div className="space-y-4">
                  {group.items.map((c) => (
                    <div
                      key={c.name}
                      className="border border-neutral-200 rounded-xl p-5 hover:border-brand-200 transition-colors"
                    >
                      <div className="flex flex-wrap items-start gap-2 mb-2">
                        <h3 className="text-sm font-bold text-neutral-900 leading-snug flex-1 min-w-0">
                          {c.name}
                        </h3>
                        <span className="shrink-0 text-xs font-mono text-neutral-400 tabular-nums">
                          {c.year}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 leading-relaxed mb-3">{c.summary}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {c.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[11px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="prose max-w-none mt-10">
            <h2 className="section-heading">El control de convencionalidad</h2>
            <p>
              La doctrina del <strong>control de convencionalidad</strong> — desarrollada por la
              Corte IDH desde el caso{' '}
              <em>Almonacid Arellano vs. Chile</em> (2006) — exige que todos los jueces y
              funcionarios de los Estados parte apliquen la Convención Americana y la interpretación
              de la Corte IDH, incluso cuando la ley interna diga otra cosa. Para los derechos
              indígenas, esto significa que los estándares de los casos listados arriba son
              vinculantes en toda la región, no solo en los países que fueron demandados.
            </p>
            <p>
              En la práctica, los abogados de comunidades indígenas citan regularmente la
              jurisprudencia de la Corte IDH ante tribunales nacionales para exigir consulta
              previa, detener proyectos extractivos o reclamar territorios. Chile, Colombia,
              Ecuador, Bolivia y Costa Rica tienen jurisprudencia constitucional que aplica
              directamente estos estándares.
            </p>

            <h2 className="section-heading">Cómo leer los fallos</h2>
            <p>
              Los fallos de la Corte IDH tienen tres partes que importan en la práctica:
            </p>
            <ul>
              <li>
                <strong>Excepciones preliminares y competencia</strong> — define si el caso es
                admisible y qué período temporal abarca.
              </li>
              <li>
                <strong>Fondo</strong> — los hechos probados y las violaciones declaradas, con
                análisis de derecho.
              </li>
              <li>
                <strong>Reparaciones</strong> — las obligaciones concretas del Estado: titulación
                de territorios, pagos, investigaciones, medidas de no repetición. Esta sección
                es la más operativa para organizaciones y comunidades.
              </li>
            </ul>
            <p>
              Los textos completos están disponibles en el sitio oficial de la Corte IDH
              (corteidh.or.cr), en español, inglés y portugués.
            </p>
          </div>

          <div className="mt-10 p-5 bg-neutral-50 rounded-lg border border-neutral-100">
            <p className="text-sm text-neutral-600 mb-3">
              Seguimos los litigios activos ante la Corte IDH y los tribunales nacionales que
              aplican esta jurisprudencia.
            </p>
            <Link
              to="/casos"
              className="inline-block text-sm font-medium text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Ver casos en curso →
            </Link>
          </div>

        </div>
      </div>
    </>
  )
}
