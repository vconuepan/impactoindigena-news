import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

const META = {
  title: 'Chile Intercultural: guía completa | Impacto Indígena',
  description:
    'Chile tiene diez pueblos indígenas reconocidos por ley. Conoce quiénes son, dónde viven, cuántos son y cuáles son sus principales demandas: mapuche, aymara, rapanui, atacameño y más.',
  url: `${SEO.siteUrl}/guia/pueblos-indigenas-chile`,
}

const PUEBLOS = [
  {
    nombre: 'Mapuche',
    poblacion: '1.745.147',
    region: 'La Araucanía, Los Ríos, Los Lagos, Región Metropolitana',
    descripcion:
      'El pueblo más numeroso de Chile, con el 79,8% de la población indígena nacional. Habitan ancestralmente el Wallmapu, territorio que se extiende desde el río Biobío hasta la Patagonia. Su lengua es el mapuzungún.',
    slug: 'mapuche',
    guia: '/guia/pueblo-mapuche',
  },
  {
    nombre: 'Aymara',
    poblacion: '156.754',
    region: 'Arica y Parinacota, Tarapacá',
    descripcion:
      'Pueblo andino de la región del altiplano, con presencia histórica en el norte de Chile, Perú y Bolivia. Su cultura está profundamente ligada a la agricultura en terrazas, la ganadería de camélidos y el ritual andino.',
    slug: 'aymara',
    guia: null,
  },
  {
    nombre: 'Diaguita',
    poblacion: '88.474',
    region: 'Atacama, Coquimbo',
    descripcion:
      'Pueblo del norte chico de Chile, redescubierto y reconocido legalmente en 2006. Habitaron los valles transversales y la zona costera del norte semiárido. Reconocidos por su cerámica característica.',
    slug: null,
    guia: null,
  },
  {
    nombre: 'Atacameño (Lickanantay)',
    poblacion: '30.369',
    region: 'Antofagasta',
    descripcion:
      'Pueblo del desierto de Atacama, uno de los más antiguos de América del Sur. Su territorio ancestral incluye el Salar de Atacama, codiciado por el litio. Su nombre propio es Lickanantay.',
    slug: null,
    guia: null,
  },
  {
    nombre: 'Quechua',
    poblacion: '33.868',
    region: 'Antofagasta, Tarapacá',
    descripcion:
      'Pueblo andino con presencia en el norte de Chile, vinculado culturalmente al vasto mundo quechua de los Andes. Su lengua, el quechua, es la más hablada entre los pueblos originarios de América del Sur.',
    slug: null,
    guia: null,
  },
  {
    nombre: 'Rapanui',
    poblacion: '9.399',
    region: 'Isla de Pascua (Rapa Nui)',
    descripcion:
      'Pueblo polinesio de Rapa Nui (Isla de Pascua), a 3.700 km del continente. Creadores de los moai, los monolitos de piedra más icónicos del mundo. Demandan mayor autonomía y control territorial sobre la isla.',
    slug: null,
    guia: null,
  },
  {
    nombre: 'Lamas (Lafkenche)',
    poblacion: '14.093',
    region: 'Araucanía, Los Lagos (costa)',
    descripcion:
      'Subgrupo mapuche costero ("gente del mar") con una identidad cultural propia ligada al mar y los recursos costeros. La Ley Lafkenche (2008) reconoce su derecho a los espacios costeros marinos.',
    slug: null,
    guia: null,
  },
  {
    nombre: 'Colla',
    poblacion: '20.744',
    region: 'Atacama',
    descripcion:
      'Pueblo trashumante de la Puna de Atacama, con tradición de pastoreo de camélidos en las alturas. Su territorio ancestral abarca zonas de alta montaña hoy cruzadas por concesiones mineras.',
    slug: null,
    guia: null,
  },
  {
    nombre: 'Kawésqar',
    poblacion: '3.448',
    region: 'Magallanes',
    descripcion:
      'Uno de los pueblos nómades del mar más australes del mundo, con una cultura excepcional adaptada a los canales patagónicos. Hoy en grave riesgo de desaparición cultural: quedan menos de diez hablantes nativos del kawésqar.',
    slug: null,
    guia: null,
  },
  {
    nombre: 'Yagán',
    poblacion: '1.600',
    region: 'Cabo de Hornos',
    descripcion:
      'El pueblo más austral del planeta, habitante de Tierra del Fuego y el Cabo de Hornos. En situación crítica de extinción cultural: la última hablante nativa fluida de yagán falleció en 2022. Su memoria es patrimonio de la humanidad.',
    slug: null,
    guia: null,
  },
]

export default function ChileHubPage() {
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
            headline: 'Chile Intercultural: guía completa',
            description: META.description,
            url: META.url,
            author: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            publisher: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            about: [
              { '@type': 'Thing', name: 'Pueblos indígenas Chile' },
              { '@type': 'Thing', name: 'Mapuche' },
              { '@type': 'Thing', name: 'Aymara' },
              { '@type': 'Thing', name: 'Derechos indígenas' },
            ],
          },
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Guías', url: `${SEO.siteUrl}/guia` },
            { name: 'Chile Intercultural' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: '¿Cuántos pueblos indígenas hay en Chile?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'La Ley Indígena N° 19.253 reconoce diez pueblos indígenas en Chile: mapuche, aymara, rapanui, atacameño (lickanantay), quechua, colla, diaguita, kawésqar, yagán y lamas (lafkenche). Según el Censo 2017, 2.185.792 personas se identificaron como pertenecientes a alguno de estos pueblos, el 12,4% de la población total.',
                },
              },
              {
                '@type': 'Question',
                name: '¿Cuál es el pueblo indígena más grande de Chile?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'El pueblo mapuche es el más numeroso, con 1.745.147 personas según el Censo 2017, lo que representa el 79,8% del total de la población indígena en Chile.',
                },
              },
              {
                '@type': 'Question',
                name: '¿Tienen reconocimiento constitucional los pueblos indígenas en Chile?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'No. Chile es uno de los pocos países latinoamericanos sin reconocimiento constitucional explícito de sus pueblos indígenas. El proceso constituyente de 2022 intentó incluirlo pero fue rechazado en plebiscito. El debate sobre un nuevo marco constitucional continúa.',
                },
              },
            ],
          },
        ]}
      />

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">Guía</span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            Chile Intercultural
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Diez pueblos. Un país. Sus territorios, sus lenguas y sus derechos.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-2xl mx-auto">

          <h2 className="section-heading mt-8">¿Quiénes son los pueblos indígenas de Chile?</h2>
          <p>
            Chile reconoce legalmente diez pueblos indígenas a través de la{' '}
            <strong>Ley Indígena N° 19.253</strong> de 1993. Según el{' '}
            <strong>Censo 2017</strong>, 2.185.792 personas se identificaron como
            pertenecientes a alguno de estos pueblos, el <strong>12,4% de la población total</strong>.
          </p>
          <p>
            Estos pueblos son radicalmente distintos entre sí: van desde los yaganes del Cabo de
            Hornos hasta los aymaras del altiplano nortino, pasando por los polinesios rapanui de
            Isla de Pascua. Lo que comparten es la condición de haber habitado estos territorios
            antes de la conformación del Estado chileno — y la lucha por el reconocimiento de sus
            derechos colectivos.
          </p>

          <h2 className="section-heading mt-8">Los diez pueblos reconocidos</h2>
        </div>

        {/* Pueblo cards — outside prose to allow full-width grid */}
        <div className="max-w-2xl mx-auto mt-4 space-y-4">
          {PUEBLOS.map((pueblo) => (
            <div key={pueblo.nombre} className="border border-neutral-200 rounded-lg p-5">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h3 className="font-bold text-lg text-neutral-900 leading-snug">{pueblo.nombre}</h3>
                <span className="text-xs text-neutral-500 whitespace-nowrap mt-1">
                  {pueblo.poblacion} personas
                </span>
              </div>
              <p className="text-xs text-brand-800 font-medium mb-2">{pueblo.region}</p>
              <p className="text-sm text-neutral-700 leading-relaxed">{pueblo.descripcion}</p>
              {pueblo.guia && (
                <Link
                  to={pueblo.guia}
                  className="inline-block mt-3 text-sm font-medium text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                >
                  Guía completa sobre el pueblo {pueblo.nombre} →
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="prose max-w-2xl mx-auto">

          <h2 className="section-heading mt-10">Marco legal y derechos</h2>
          <p>
            El marco normativo que rige los derechos indígenas en Chile incluye:
          </p>
          <ul>
            <li>
              <strong>Ley Indígena N° 19.253 (1993)</strong> — reconoce los diez pueblos,
              protege tierras indígenas y crea la CONADI (Corporación Nacional de Desarrollo Indígena).
            </li>
            <li>
              <strong>Convenio 169 de la OIT (ratificado en 2008)</strong> — obliga al Estado a
              consultar a los pueblos indígenas antes de adoptar medidas que los afecten.
            </li>
            <li>
              <strong>Declaración de la ONU sobre Pueblos Indígenas (2007)</strong> — establece el
              Consentimiento Libre, Previo e Informado (CLPI) como estándar para proyectos en
              territorios ancestrales.
            </li>
          </ul>
          <p>
            Chile es uno de los pocos países latinoamericanos <strong>sin reconocimiento
            constitucional</strong> de sus pueblos indígenas. Dos intentos constituyentes
            recientes (2022 y 2023) no lograron aprobarse. El debate continúa.
          </p>

          <h2 className="section-heading mt-8">Preguntas frecuentes</h2>

          <h3>¿Cuántos pueblos indígenas hay en Chile?</h3>
          <p>
            La Ley Indígena reconoce diez pueblos: mapuche, aymara, rapanui, atacameño
            (lickanantay), quechua, colla, diaguita, kawésqar, yagán y lamas. Según el Censo
            2017, el 12,4% de la población chilena se identifica como indígena.
          </p>

          <h3>¿Tienen reconocimiento constitucional?</h3>
          <p>
            No. Chile carece de reconocimiento constitucional explícito de sus pueblos indígenas,
            a diferencia de Bolivia, Ecuador, Colombia o México. El proceso constituyente de 2022
            intentó incorporarlo pero fue rechazado en plebiscito. El debate sobre un nuevo marco
            constitucional sigue abierto.
          </p>

          <h3>¿Dónde vive la mayoría de los indígenas en Chile?</h3>
          <p>
            Aunque la imagen más extendida es la de comunidades rurales, más del 60% de la
            población indígena en Chile vive en zonas urbanas, especialmente en la Región
            Metropolitana de Santiago. La migración campo-ciudad fue masiva durante el siglo XX
            y continúa en el XXI.
          </p>

          <div className="mt-10 p-5 bg-neutral-50 rounded-lg border border-neutral-100">
            <p className="text-sm text-neutral-600 mb-3">
              Seguimos las noticias sobre los pueblos indígenas de Chile en tiempo real, curadas por IA.
            </p>
            <Link
              to="/issues/chile-indigena"
              className="inline-block text-sm font-medium text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Ver últimas noticias sobre Chile Indígena →
            </Link>
          </div>

        </div>
      </div>
    </>
  )
}
