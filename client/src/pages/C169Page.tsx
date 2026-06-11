import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

const META = {
  title: 'C169 OIT: los 24 países que ratificaron el Convenio | Impacto Indígena',
  description:
    'Mapa completo de ratificación del Convenio 169 de la OIT sobre pueblos indígenas: 24 países en 5 continentes. Fechas de ratificación y qué significa para los derechos indígenas en cada región.',
  url: `${SEO.siteUrl}/guia/c169-pais-por-pais`,
}

interface Country {
  name: string
  year: number
}

interface Region {
  label: string
  countries: Country[]
}

const REGIONS: Region[] = [
  {
    label: 'América del Sur',
    countries: [
      { name: 'Bolivia', year: 1991 },
      { name: 'Colombia', year: 1991 },
      { name: 'Paraguay', year: 1993 },
      { name: 'Perú', year: 1994 },
      { name: 'Ecuador', year: 1998 },
      { name: 'Argentina', year: 2000 },
      { name: 'Brasil', year: 2002 },
      { name: 'Venezuela', year: 2002 },
      { name: 'Chile', year: 2008 },
    ],
  },
  {
    label: 'América Central y Caribe',
    countries: [
      { name: 'Costa Rica', year: 1993 },
      { name: 'Honduras', year: 1995 },
      { name: 'Guatemala', year: 1996 },
      { name: 'Dominica', year: 2002 },
      { name: 'Nicaragua', year: 2010 },
    ],
  },
  {
    label: 'América del Norte',
    countries: [{ name: 'México', year: 1990 }],
  },
  {
    label: 'Europa',
    countries: [
      { name: 'Noruega', year: 1990 },
      { name: 'Dinamarca', year: 1996 },
      { name: 'Países Bajos', year: 1998 },
      { name: 'España', year: 2007 },
      { name: 'Luxemburgo', year: 2018 },
    ],
  },
  {
    label: 'Asia y Pacífico',
    countries: [
      { name: 'Fiyi', year: 1998 },
      { name: 'Nepal', year: 2007 },
    ],
  },
  {
    label: 'África',
    countries: [
      { name: 'Camerún', year: 2009 },
      { name: 'República Centroafricana', year: 2010 },
    ],
  },
]

export default function C169Page() {
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
            headline: 'C169 OIT: los 24 países que ratificaron el Convenio',
            description: META.description,
            url: META.url,
            author: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            publisher: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            about: [
              { '@type': 'Thing', name: 'Convenio 169 OIT' },
              { '@type': 'Thing', name: 'Derechos de los pueblos indígenas' },
              { '@type': 'Thing', name: 'Derecho internacional' },
            ],
          },
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Guías', url: `${SEO.siteUrl}/guia` },
            { name: 'C169 OIT: estado por país' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: '¿Qué es el Convenio 169 de la OIT?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'El Convenio 169 de la Organización Internacional del Trabajo (OIT) es el principal instrumento internacional jurídicamente vinculante sobre derechos de los pueblos indígenas y tribales. Adoptado en 1989, establece derechos sobre tierras, consulta previa, empleo, salud y educación. A diferencia de la Declaración de la ONU, es un tratado que obliga a los Estados que lo ratifican.',
                },
              },
              {
                '@type': 'Question',
                name: '¿Qué implica ratificar el Convenio 169?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Al ratificar el C169, un Estado se compromete a reconocer los derechos colectivos de los pueblos indígenas, realizar consulta previa antes de proyectos que los afecten, respetar sus territorios y recursos, y aplicar el convenio en su legislación interna. El cumplimiento es supervisado por la OIT.',
                },
              },
              {
                '@type': 'Question',
                name: '¿Cuántos países han ratificado el C169 de la OIT?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'El Convenio 169 ha sido ratificado por 24 países, distribuidos en 5 continentes. América Latina concentra la mayoría de las ratificaciones (15 países), seguida de Europa (5), Asia y Pacífico (2) y África (2). Fuente: base de datos NORMLEX de la OIT.',
                },
              },
            ],
          },
        ]}
      />

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">
            Guía · Vertical jurídico
          </span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            C169 OIT: estado por país
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            El único tratado vinculante de derechos indígenas. 24 países ratificados, 5 continentes.
          </p>
          <div className="flex justify-center gap-8 mt-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">24</p>
              <p className="text-sm text-white/50 mt-1">países ratificantes</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">5</p>
              <p className="text-sm text-white/50 mt-1">continentes</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">1989</p>
              <p className="text-sm text-white/50 mt-1">año de adopción</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-section">
        <div className="max-w-2xl mx-auto">

          <div className="prose max-w-none">
            <h2 className="section-heading mt-0">¿Qué es el Convenio 169 de la OIT?</h2>
            <p>
              El <strong>Convenio 169 de la Organización Internacional del Trabajo</strong> (OIT),
              adoptado el 27 de junio de 1989, es el principal instrumento internacional jurídicamente
              vinculante sobre los derechos de los pueblos indígenas y tribales. A diferencia de la
              Declaración de Naciones Unidas sobre los Derechos de los Pueblos Indígenas (DNUDPI,
              2007), el C169 es un <strong>tratado</strong>: los países que lo ratifican quedan
              legalmente obligados a cumplirlo.
            </p>
            <p>
              El convenio reconoce derechos sobre <strong>tierras y territorios</strong>,{' '}
              <strong>consulta previa</strong> ante proyectos que los afecten,{' '}
              <strong>empleo, salud y educación</strong> con pertinencia cultural, y la{' '}
              <strong>identidad y costumbres propias</strong> de los pueblos. Su supervisión está a
              cargo de la OIT, que puede abrir procedimientos de queja contra los Estados.
            </p>

            <h2 className="section-heading">Qué significa ratificar</h2>
            <p>
              Un Estado que ratifica el C169 asume tres compromisos centrales:
            </p>
            <ul>
              <li>
                <strong>Consultar</strong> a los pueblos indígenas antes de adoptar medidas
                legislativas, administrativas o proyectos que puedan afectarlos directamente.
              </li>
              <li>
                <strong>Reconocer</strong> sus derechos sobre las tierras que han ocupado o
                utilizado tradicionalmente, incluidos los recursos del subsuelo en algunos marcos
                nacionales.
              </li>
              <li>
                <strong>Adaptar</strong> su legislación interna para garantizar los derechos
                reconocidos en el convenio y establecer mecanismos de queja accesibles.
              </li>
            </ul>
            <p>
              El incumplimiento puede activar el sistema de supervisión de la OIT: los sindicatos,
              organizaciones indígenas o Estados pueden presentar quejas y reclamaciones ante el
              Comité de Expertos o el Consejo de Administración.
            </p>
          </div>

          {/* Country tables by region */}
          <h2 className="text-xl font-bold text-neutral-900 mt-10 mb-6">
            Los 24 países ratificantes
          </h2>
          <p className="text-sm text-neutral-500 mb-6">
            Fuente: base de datos NORMLEX de la OIT. Ordenados por año de ratificación dentro de
            cada región.
          </p>

          <div className="space-y-6">
            {REGIONS.map((region) => (
              <div key={region.label} className="border border-neutral-200 rounded-xl overflow-hidden">
                <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-neutral-700">{region.label}</span>
                  <span className="text-xs text-neutral-400 bg-white border border-neutral-200 rounded-full px-2 py-0.5">
                    {region.countries.length} {region.countries.length === 1 ? 'país' : 'países'}
                  </span>
                </div>
                <div className="divide-y divide-neutral-100">
                  {region.countries.map((c) => (
                    <div key={c.name} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-neutral-800">{c.name}</span>
                      <span className="text-xs font-mono text-neutral-500 tabular-nums">
                        {c.year}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="prose max-w-none mt-10">
            <h2 className="section-heading">Por qué América Latina lidera</h2>
            <p>
              De los 24 países ratificantes, 15 son latinoamericanos, lo que convierte a la región
              en el núcleo del sistema C169. Esta concentración no es casual: América Latina alberga
              la mayor diversidad de pueblos indígenas del mundo (más de 500 pueblos reconocidos),
              y la presión de los movimientos indígenas organizados desde los años 80 aceleró las
              ratificaciones.
            </p>
            <p>
              Bolivia fue el primero en ratificar en América del Sur (1991), apenas dos años después
              de la adopción del convenio, en un proceso impulsado por organizaciones como la CIDOB
              y la CSUTCB. México ratificó en 1990, el mismo año que Noruega, el único país nórdico
              que lo hizo de inmediato dado que el Convenio 169 surgió en parte para actualizar el
              Convenio 107 de 1957, cuyo enfoque asimilacionista Noruega ya cuestionaba por su
              experiencia con los pueblos saami.
            </p>
            <p>
              La ratificación más reciente es la de{' '}
              <strong>Luxemburgo en 2018</strong>, treinta años después de la adopción. La mayoría
              de los países de Europa central y oriental, y casi todos los de Asia y África, aún no
              han ratificado el convenio.
            </p>

            <h2 className="section-heading">Preguntas frecuentes</h2>

            <h3>¿El C169 se aplica si mi país no lo ratificó?</h3>
            <p>
              No directamente. Los tratados de la OIT solo vinculan a los Estados que los ratifican.
              Sin embargo, los principios del C169 — en particular la consulta previa y los derechos
              territoriales — han sido incorporados en la jurisprudencia de la Corte Interamericana
              de Derechos Humanos (Corte IDH) como parte del corpus iuris internacional. Los 20
              países bajo la jurisdicción contenciosa de la Corte IDH deben cumplir esa
              jurisprudencia aunque no hayan ratificado el C169.
            </p>

            <h3>¿Qué diferencia hay entre el C169 y la DNUDPI?</h3>
            <p>
              El C169 es un tratado jurídicamente vinculante supervisado por la OIT. La Declaración
              de la ONU sobre los Derechos de los Pueblos Indígenas (DNUDPI, 2007) es una resolución
              de la Asamblea General: políticamente muy significativa pero sin fuerza legal directa.
              La DNUDPI tiene un alcance más amplio (incluye el consentimiento libre, previo e
              informado como estándar autónomo) y la han adoptado 148 países, pero su implementación
              depende de la voluntad política de cada Estado.
            </p>

            <h3>¿Puede denunciarse a un Estado ante la OIT por incumplir el C169?</h3>
            <p>
              Sí. El sistema de la OIT permite dos mecanismos: las{' '}
              <strong>reclamaciones</strong> (presentadas por organizaciones de empleadores o
              trabajadores) y las <strong>quejas</strong> (entre Estados). Además, el Comité de
              Expertos en Aplicación de Convenios y Recomendaciones revisa periódicamente los
              informes de los gobiernos y puede emitir observaciones públicas. En el caso de Chile,
              el Comité ha formulado observaciones repetidas sobre la implementación del mecanismo
              de consulta.
            </p>
          </div>

          <div className="mt-10 p-5 bg-neutral-50 rounded-lg border border-neutral-100">
            <p className="text-sm text-neutral-600 mb-3">
              Cubrimos en tiempo real los casos de consulta previa, litigios territoriales y
              novedades del derecho indígena internacional en América Latina.
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
