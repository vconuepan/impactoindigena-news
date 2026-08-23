import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

const META = {
  title: 'Pueblo Mapuche: territorio, derechos y cultura | Voces Indígenas',
  description:
    'El pueblo Mapuche es el mayor pueblo indígena de Chile y Argentina. Conoce su historia, su lucha por el territorio del Wallmapu, sus derechos y las noticias más recientes.',
  url: `${SEO.siteUrl}/guia/pueblo-mapuche`,
}

export default function MapuchePage() {
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
            headline: 'Pueblo Mapuche: territorio, derechos y cultura',
            description: META.description,
            url: META.url,
            author: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            publisher: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            about: [
              { '@type': 'Thing', name: 'Pueblo Mapuche' },
              { '@type': 'Thing', name: 'Derechos indígenas Chile' },
              { '@type': 'Thing', name: 'Wallmapu' },
            ],
          },
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Guías', url: `${SEO.siteUrl}/guia` },
            { name: 'Pueblo Mapuche' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: '¿Quiénes son los mapuche?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Los mapuche son el pueblo indígena más numeroso de Chile y Argentina, con aproximadamente 1,8 millones de personas. Habitaron ancestralmente el territorio conocido como Wallmapu, que se extiende entre el río Biobío en Chile y la Patagonia argentina.',
                },
              },
              {
                '@type': 'Question',
                name: '¿Qué es el Wallmapu?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Wallmapu es el nombre mapuche para su territorio ancestral, que abarca la zona centro-sur de Chile (Araucanía, Los Ríos, Los Lagos) y parte de la Patagonia argentina. Su nombre significa "País de alrededor" en mapuzungún.',
                },
              },
              {
                '@type': 'Question',
                name: '¿Cuál es el principal conflicto territorial mapuche?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'El conflicto mapuche tiene raíces en la ocupación militar de su territorio durante el siglo XIX ("Pacificación de la Araucanía"). Hoy, las comunidades demandan restitución de tierras, reconocimiento constitucional y autodeterminación, en tensión con el Estado chileno y empresas forestales.',
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
            El pueblo Mapuche
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Historia, territorio, derechos y cultura del mayor pueblo indígena de Chile y Argentina.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-2xl mx-auto">

          <h2 className="section-heading mt-8">¿Quiénes son los mapuche?</h2>
          <p>
            Los mapuche — cuyo nombre significa "gente de la tierra" en mapuzungún — son el pueblo
            indígena más numeroso de Chile y uno de los más importantes de América del Sur. Se
            estima que hoy son aproximadamente 1,8 millones de personas, distribuidas principalmente
            en Chile (donde representan cerca del 80% de la población indígena nacional) y en la
            Patagonia argentina.
          </p>
          <p>
            Durante siglos resistieron la expansión del Imperio Inca y luego la colonización
            española, siendo uno de los pocos pueblos en América que nunca fue completamente
            sometido hasta el siglo XIX. Esta resistencia, conocida como la Guerra de Arauco,
            duró más de 300 años y forjó una identidad cultural profunda marcada por la autonomía,
            la espiritualidad y la relación con la tierra.
          </p>

          <h2 className="section-heading mt-8">El Wallmapu: su territorio ancestral</h2>
          <p>
            El <strong>Wallmapu</strong> — "País de alrededor" — es el nombre del territorio
            ancestral mapuche, que se extiende desde el río Biobío en Chile hasta la Patagonia
            argentina, incluyendo las regiones de La Araucanía, Los Ríos y Los Lagos. Este
            territorio no es solo una referencia geográfica: es el centro de la identidad
            cultural, espiritual y política del pueblo mapuche.
          </p>
          <p>
            En el siglo XIX, los estados chileno y argentino ocuparon militarmente el Wallmapu
            en lo que se conoce como la "Pacificación de la Araucanía" (1861-1883). Las
            comunidades mapuche perdieron la mayor parte de sus tierras y fueron confinadas a
            pequeñas reducciones. Esa herida histórica es el origen del conflicto territorial
            que persiste hasta hoy.
          </p>

          <h2 className="section-heading mt-8">La lucha por los derechos hoy</h2>
          <p>
            Las principales demandas del pueblo mapuche en la actualidad incluyen:
          </p>
          <ul>
            <li><strong>Restitución de tierras</strong> — devolución de territorios usurpados durante la ocupación militar del siglo XIX.</li>
            <li><strong>Reconocimiento constitucional</strong> — Chile es uno de los pocos países latinoamericanos sin reconocimiento explícito de sus pueblos indígenas en la Constitución.</li>
            <li><strong>Autonomía y autodeterminación</strong> — derecho a gobernarse con sus propias instituciones en sus territorios.</li>
            <li><strong>Protección de sitios sagrados</strong> — defensa de ríos, montañas y bosques con valor espiritual amenazados por proyectos extractivos.</li>
          </ul>
          <p>
            El conflicto se intensificó en las últimas décadas por la expansión de la industria
            forestal en la Araucanía, que ha reemplazado bosque nativo con plantaciones de
            pino y eucalipto en territorios reivindicados. La respuesta del Estado chileno
            ha incluido la aplicación de la Ley Antiterrorista a comuneros mapuche, lo que
            ha sido criticado por organismos internacionales de derechos humanos.
          </p>

          <h2 className="section-heading mt-8">Cultura y lengua</h2>
          <p>
            El <strong>mapuzungún</strong> (lengua de la tierra) es el idioma mapuche, hablado
            por aproximadamente 250.000 personas. Aunque enfrenta riesgos de extinción por
            la presión del español, existen iniciativas activas de revitalización lingüística
            en escuelas y comunidades, así como una nueva generación de comunicadores y
            creadores de contenido digital en mapuzungún.
          </p>
          <p>
            La espiritualidad mapuche tiene en el <strong>Nguillatún</strong> (ceremonia
            colectiva de rogativa) y en el <strong>Machi</strong> (autoridad espiritual y
            sanadora) sus expresiones más representativas. La cosmovisión mapuche concibe
            a la naturaleza como un sistema vivo de relaciones — el <em>ixofillmogen</em>
            (biodiversidad) — del que los humanos forman parte, no son dueños.
          </p>

          <h2 className="section-heading mt-8">Preguntas frecuentes</h2>

          <h3>¿Qué es el "conflicto mapuche"?</h3>
          <p>
            Es el nombre con que los medios chilenos describen la tensión entre comunidades
            mapuche que reivindican tierras y el Estado y empresas privadas que las ocupan.
            Involucra recuperaciones de terrenos, incendios de maquinaria forestal, y la
            respuesta policial y judicial del Estado. Organismos internacionales como la ONU
            han pedido a Chile resolver el conflicto mediante el diálogo y el reconocimiento
            de los derechos indígenas.
          </p>

          <h3>¿Cómo está reconocido el pueblo mapuche en la ley chilena?</h3>
          <p>
            La Ley Indígena N° 19.253 de 1993 reconoce a los mapuche como pueblo indígena
            y protege ciertas tierras. Sin embargo, Chile no tiene reconocimiento constitucional
            de sus pueblos indígenas. El proceso constituyente de 2022 que intentó incorporarlo
            fue rechazado en plebiscito. El debate continúa.
          </p>

          <h3>¿Cuántos mapuche hay en Chile?</h3>
          <p>
            Según el Censo 2017, 1.745.147 personas se identificaron como mapuche en Chile,
            representando el 9,9% de la población total. La mayoría vive en la Región
            Metropolitana (migración campo-ciudad) y en La Araucanía.
          </p>

          <div className="mt-10 p-5 bg-neutral-50 rounded-lg border border-neutral-100">
            <p className="text-sm text-neutral-600 mb-3">
              Seguimos las noticias sobre el pueblo Mapuche en tiempo real, curadas por IA.
            </p>
            <Link
              to="/comunidad/mapuche"
              className="inline-block text-sm font-medium text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Ver últimas noticias sobre el pueblo Mapuche →
            </Link>
          </div>

        </div>
      </div>
    </>
  )
}
