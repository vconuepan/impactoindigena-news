import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

const META = {
  title: 'Declaración de la ONU sobre Derechos de los Pueblos Indígenas (UNDRIP) | Impacto Indígena',
  description:
    'Guía completa sobre la DNUDPI/UNDRIP: qué derechos reconoce, quiénes la adoptaron, cómo se diferencia del Convenio 169 y qué fuerza jurídica tiene en América Latina.',
  url: `${SEO.siteUrl}/guia/declaracion-onu-undrip`,
}

const KEY_ARTICLES = [
  {
    number: 3,
    title: 'Libre determinación',
    text: 'Los pueblos indígenas tienen derecho a la libre determinación. En virtud de ese derecho determinan libremente su condición política y persiguen libremente su desarrollo económico, social y cultural.',
  },
  {
    number: 10,
    title: 'No a la reubicación forzada',
    text: 'Los pueblos indígenas no serán desplazados por la fuerza de sus tierras o territorios. No se procederá a ningún traslado sin el consentimiento libre, previo e informado de los pueblos indígenas interesados.',
  },
  {
    number: 19,
    title: 'Consulta y consentimiento',
    text: 'Los Estados celebrarán consultas y cooperarán de buena fe con los pueblos indígenas interesados por medio de sus instituciones representativas antes de adoptar y aplicar medidas legislativas o administrativas que los afecten, para obtener su consentimiento libre, previo e informado.',
  },
  {
    number: 26,
    title: 'Tierras, territorios y recursos',
    text: 'Los pueblos indígenas tienen derecho a las tierras, territorios y recursos que tradicionalmente han poseído, ocupado o utilizado o adquirido. Los Estados asegurarán el reconocimiento y protección jurídicos de esas tierras, territorios y recursos.',
  },
  {
    number: 32,
    title: 'Proyectos de desarrollo',
    text: 'Los Estados celebrarán consultas y cooperarán de buena fe con los pueblos indígenas interesados con miras a obtener su consentimiento libre e informado antes de aprobar cualquier proyecto que afecte a sus tierras o territorios y otros recursos, particularmente en relación con el desarrollo, la utilización o la explotación de recursos minerales, hídricos o de otro tipo.',
  },
  {
    number: 46,
    title: 'Integridad del Estado',
    text: 'Nada de lo contenido en la presente Declaración se interpretará en el sentido de que confiere a un pueblo indígena el derecho a participar en actividades o realizar actos contrarios a la Carta de las Naciones Unidas.',
  },
]

const ADOPTION = [
  { label: 'Adoptada', value: '13 de septiembre de 2007' },
  { label: 'Resolución', value: 'A/RES/61/295' },
  { label: 'Votos a favor', value: '143 Estados' },
  { label: 'En contra (al votar)', value: '4 (Australia, Canadá, Nueva Zelanda, EE.UU.)' },
  { label: 'Abstenciones', value: '11' },
  { label: 'Artículos', value: '46' },
  { label: 'Naturaleza', value: 'Declaración (no vinculante como tratado)' },
]

export default function UnidripPage() {
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
            headline: 'Declaración de la ONU sobre los Derechos de los Pueblos Indígenas (UNDRIP/DNUDPI)',
            description: META.description,
            url: META.url,
            author: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            publisher: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            about: [
              { '@type': 'Thing', name: 'UNDRIP' },
              { '@type': 'Thing', name: 'Declaración de la ONU sobre los Derechos de los Pueblos Indígenas' },
              { '@type': 'Thing', name: 'Derechos de los pueblos indígenas' },
            ],
          },
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Guías', url: `${SEO.siteUrl}/guia` },
            { name: 'Declaración ONU (UNDRIP)' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: '¿Qué es la UNDRIP o DNUDPI?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'La UNDRIP (United Nations Declaration on the Rights of Indigenous Peoples) o DNUDPI (Declaración de Naciones Unidas sobre los Derechos de los Pueblos Indígenas) es el instrumento internacional más completo sobre derechos indígenas. Fue adoptada por la Asamblea General de la ONU el 13 de septiembre de 2007 con 143 votos a favor. Sus 46 artículos cubren libre determinación, tierras, cultura, educación, salud y consentimiento libre, previo e informado.',
                },
              },
              {
                '@type': 'Question',
                name: '¿La UNDRIP es jurídicamente vinculante?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'No directamente. Como resolución de la Asamblea General, no es un tratado de derecho internacional. Sin embargo, varios de sus principios — en particular el consentimiento libre, previo e informado (Art. 19) — han sido incorporados en la jurisprudencia de la Corte Interamericana de Derechos Humanos y de tribunales nacionales, adquiriendo fuerza vinculante indirecta en los países del sistema interamericano.',
                },
              },
              {
                '@type': 'Question',
                name: '¿Qué diferencia hay entre la UNDRIP y el Convenio 169 de la OIT?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'El Convenio 169 de la OIT (1989) es un tratado jurídicamente vinculante, pero solo para los 24 países que lo han ratificado. La UNDRIP (2007) no es un tratado pero la han adoptado más de 140 países y tiene un alcance más amplio, incluyendo el consentimiento como estándar autónomo. En la práctica, los abogados usan ambos instrumentos de manera complementaria.',
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
            Declaración ONU sobre Derechos Indígenas
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            La UNDRIP: el instrumento más amplio de derechos indígenas, adoptado por 143 países
            en 2007 tras más de 20 años de negociación.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="max-w-2xl mx-auto">

          {/* Ficha rápida */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden mb-10">
            <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
              <span className="text-sm font-bold text-neutral-700">Ficha: UNDRIP / DNUDPI</span>
            </div>
            <div className="divide-y divide-neutral-100">
              {ADOPTION.map((row) => (
                <div key={row.label} className="flex items-start px-4 py-2.5 gap-4">
                  <span className="text-xs text-neutral-500 w-36 shrink-0 pt-0.5">{row.label}</span>
                  <span className="text-sm text-neutral-800">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="prose max-w-none">
            <h2 className="section-heading mt-0">Qué es y por qué importa</h2>
            <p>
              La <strong>Declaración de Naciones Unidas sobre los Derechos de los Pueblos Indígenas</strong>{' '}
              (DNUDPI en español, UNDRIP en inglés) es el instrumento internacional más exhaustivo
              sobre derechos indígenas hasta la fecha. Fue adoptada el 13 de septiembre de 2007 por
              la Asamblea General de la ONU tras más de veinte años de negociación, en los que
              participaron directamente organizaciones indígenas de todo el mundo.
            </p>
            <p>
              La Declaración reconoce que los pueblos indígenas son iguales a todos los demás pueblos
              y tienen derecho a ser diferentes: a mantener sus lenguas, identidades, sistemas de
              gobierno, territorios y culturas. Sus 46 artículos cubren el espectro completo de
              derechos — civiles, políticos, económicos, sociales, culturales y colectivos — con un
              énfasis particular en el{' '}
              <strong>consentimiento libre, previo e informado</strong> (CLPI) como condición para
              los proyectos que afecten sus tierras.
            </p>

            <h2 className="section-heading">Los cuatro votos en contra y sus reversiones</h2>
            <p>
              Cuatro países votaron en contra en 2007: <strong>Australia, Canadá, Nueva Zelanda
              y Estados Unidos</strong>. Todos alegaron preocupaciones sobre la libre determinación
              y el CLPI como potenciales derechos de veto sobre proyectos nacionales. Sin embargo,
              los cuatro revirtieron su posición en los años siguientes:
            </p>
            <ul>
              <li><strong>Australia</strong> — endorsó la Declaración en abril de 2009</li>
              <li><strong>Nueva Zelanda</strong> — endorsó en abril de 2010</li>
              <li><strong>Canadá</strong> — endorsó en noviembre de 2010</li>
              <li><strong>Estados Unidos</strong> — endorsó en diciembre de 2010</li>
            </ul>
            <p>
              La reversión canadiense fue la más relevante políticamente: en 2016, el gobierno de
              Justin Trudeau anunció la implementación plena de la UNDRIP en el derecho canadiense,
              lo que se tradujo en la Ley C-15 de 2021, la primera legislación nacional de
              implementación de la DNUDPI en el mundo anglosajón.
            </p>
          </div>

          {/* Key articles */}
          <h2 className="text-xl font-bold text-neutral-900 mt-10 mb-2">Artículos clave</h2>
          <p className="text-sm text-neutral-500 mb-6">
            Selección de los artículos más citados en litigios, negociaciones y políticas públicas.
            Texto oficial de la ONU, Resolución A/RES/61/295.
          </p>
          <div className="space-y-3">
            {KEY_ARTICLES.map((art) => (
              <div key={art.number} className="border border-neutral-200 rounded-xl p-5">
                <div className="flex items-start gap-3 mb-2">
                  <span className="shrink-0 text-xs font-mono font-bold text-brand-600 bg-brand-50 border border-brand-100 px-2 py-1 rounded-md tabular-nums">
                    Art. {art.number}
                  </span>
                  <h3 className="text-sm font-bold text-neutral-900 leading-snug pt-0.5">
                    {art.title}
                  </h3>
                </div>
                <p className="text-sm text-neutral-600 leading-relaxed italic">"{art.text}"</p>
              </div>
            ))}
          </div>

          <div className="prose max-w-none mt-10">
            <h2 className="section-heading">UNDRIP vs. Convenio 169: diferencias prácticas</h2>
            <p>
              Ambos instrumentos se complementan, pero tienen naturaleza jurídica distinta:
            </p>
            <ul>
              <li>
                <strong>C169 (1989):</strong> tratado vinculante, supervisado por la OIT,
                ratificado por 24 países. Cubre consulta previa pero no establece el consentimiento
                como estándar autónomo.
              </li>
              <li>
                <strong>UNDRIP (2007):</strong> declaración no vinculante como tratado, adoptada
                por más de 140 países. Reconoce el CLPI como derecho autónomo (Art. 19, 32) y
                tiene un alcance más amplio sobre libre determinación.
              </li>
            </ul>
            <p>
              En la práctica jurídica latinoamericana, los abogados de comunidades usan ambos
              instrumentos conjuntamente: el C169 como norma vinculante y la UNDRIP como estándar
              interpretativo. La Corte IDH ha integrado la UNDRIP en su jurisprudencia como parte
              del corpus iuris de derechos humanos que los Estados deben respetar.
            </p>

            <h2 className="section-heading">Implementación en América Latina</h2>
            <p>
              Bolivia fue el primer país del mundo en incorporar la UNDRIP en su ordenamiento
              interno, mediante la Ley 3760 aprobada en noviembre de 2007, el mismo año de la
              adopción de la Declaración. Ecuador (2008) y Bolivia (2009) consagraron el CLPI
              en sus constituciones nacionales. En Chile, la falta de un reconocimiento
              constitucional de los pueblos indígenas es señalada como una brecha estructural
              para implementar los estándares de la UNDRIP.
            </p>
            <p>
              A nivel regional, la Organización de Estados Americanos (OEA) adoptó en 2016 su
              propia Declaración Americana sobre los Derechos de los Pueblos Indígenas, que
              desarrolla en el sistema interamericano los principios de la UNDRIP.
            </p>

            <h2 className="section-heading">Preguntas frecuentes</h2>

            <h3>¿La UNDRIP le da a los pueblos indígenas derecho de veto sobre proyectos?</h3>
            <p>
              Esta fue la principal objeción de los cuatro países que votaron en contra en 2007.
              La respuesta corta es: no es un veto absoluto, pero es más que una consulta. El
              artículo 32 exige que el Estado obtenga el consentimiento libre, previo e informado
              antes de aprobar proyectos que afecten tierras o recursos. La Corte IDH, en el caso{' '}
              <em>Saramaka vs. Surinam</em>, aclaró que los grandes proyectos de desarrollo
              requieren consentimiento, mientras que los proyectos menores requieren consulta.
              La línea entre "grande" y "menor" sigue definiéndose caso a caso.
            </p>

            <h3>¿Puede un ciudadano invocar la UNDRIP ante un tribunal?</h3>
            <p>
              Directamente, no. Como declaración, la UNDRIP no crea derechos individuales
              accionables por sí misma. Sin embargo, puede invocarse como norma interpretativa
              para dar contenido a derechos consagrados en tratados vinculantes (Convención
              Americana, C169) o en constituciones nacionales. En jurisdicciones donde los
              tratados de derechos humanos tienen jerarquía constitucional (Argentina, Bolivia,
              Ecuador), los jueces aplican la UNDRIP de manera cada vez más frecuente.
            </p>

            <h3>¿Qué es la Declaración Americana de Derechos Indígenas?</h3>
            <p>
              La{' '}
              <strong>
                Declaración Americana sobre los Derechos de los Pueblos Indígenas
              </strong>{' '}
              fue adoptada por la OEA el 15 de junio de 2016, diez años después de que comenzara
              su negociación. Es más específica que la UNDRIP en materia de autodesarrollo,
              consulta y derechos colectivos, y está redactada en el marco del sistema
              interamericano. Aunque tampoco es un tratado, sirve como guía de interpretación
              para la Corte IDH y la Comisión Interamericana.
            </p>
          </div>

          <div className="mt-10 p-5 bg-neutral-50 rounded-lg border border-neutral-100">
            <p className="text-sm text-neutral-600 mb-3">
              Cubrimos las novedades del derecho indígena internacional y los fallos que aplican
              los estándares de la UNDRIP en América Latina.
            </p>
            <Link
              to="/guia/jurisprudencia-interamericana"
              className="inline-block text-sm font-medium text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Ver jurisprudencia clave de la Corte IDH →
            </Link>
          </div>

        </div>
      </div>
    </>
  )
}
