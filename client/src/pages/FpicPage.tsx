import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

const META = {
  title: 'Consulta Previa y CLPI: qué son y por qué importan | Voces Indígenas',
  description:
    'La Consulta Previa y el Consentimiento Libre, Previo e Informado (CLPI) son derechos fundamentales de los pueblos indígenas. Conoce qué son, cómo funcionan y por qué los Estados deben respetarlos.',
  url: `${SEO.siteUrl}/guia/consulta-previa-fpic`,
}

export default function FpicPage() {
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
            headline: 'Consulta Previa y CLPI: qué son y por qué importan',
            description: META.description,
            url: META.url,
            author: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            publisher: { '@type': 'Organization', name: SEO.siteName, url: SEO.siteUrl },
            about: [
              { '@type': 'Thing', name: 'Consulta Previa' },
              { '@type': 'Thing', name: 'CLPI' },
              { '@type': 'Thing', name: 'Derechos indígenas' },
              { '@type': 'Thing', name: 'Convenio 169 OIT' },
            ],
          },
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Guías', url: `${SEO.siteUrl}/guia` },
            { name: 'Consulta Previa y CLPI' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: '¿Qué es la Consulta Previa?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'La Consulta Previa es el derecho de los pueblos indígenas a ser consultados antes de que el Estado adopte medidas legislativas o administrativas que puedan afectarlos. Está consagrada en el Convenio 169 de la OIT (1989) y en la Declaración de Naciones Unidas sobre los Derechos de los Pueblos Indígenas (2007).',
                },
              },
              {
                '@type': 'Question',
                name: '¿Qué significa CLPI o FPIC?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'CLPI son las siglas de Consentimiento Libre, Previo e Informado (en inglés, Free, Prior and Informed Consent — FPIC). Es un estándar más exigente que la consulta: requiere no solo informar y escuchar, sino obtener el consentimiento efectivo de las comunidades afectadas antes de aprobar proyectos en sus territorios.',
                },
              },
              {
                '@type': 'Question',
                name: '¿La Consulta Previa obliga a los Estados a aceptar lo que decidan las comunidades?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Depende del estándar aplicable. La Consulta Previa del Convenio 169 exige buena fe y buscar acuerdos, pero no necesariamente el veto. El CLPI, recogido en la Declaración de la ONU, sí implica que ciertos proyectos — especialmente los que afectan territorios o recursos naturales de modo irreversible — requieren consentimiento expreso de las comunidades.',
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
            Consulta Previa y CLPI
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            El derecho de los pueblos indígenas a decidir sobre los proyectos que afectan sus territorios.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-2xl mx-auto">

          <h2 className="section-heading mt-8">¿Qué es la Consulta Previa?</h2>
          <p>
            La <strong>Consulta Previa</strong> es el mecanismo mediante el cual los Estados deben
            consultar a los pueblos indígenas antes de adoptar decisiones que puedan afectar sus
            derechos, territorios, recursos naturales o formas de vida. No es una cortesía ni un
            trámite administrativo: es un derecho reconocido internacionalmente.
          </p>
          <p>
            Su fundamento principal está en el <strong>Convenio 169 de la Organización Internacional
            del Trabajo</strong> (OIT), adoptado en 1989 y ratificado por la mayoría de los países
            latinoamericanos. Chile lo ratificó en 2008. El Convenio establece que la consulta debe
            realizarse "de buena fe, de una manera apropiada a las circunstancias, con la finalidad
            de llegar a un acuerdo o lograr el consentimiento".
          </p>

          <h2 className="section-heading mt-8">¿Qué es el CLPI?</h2>
          <p>
            El <strong>Consentimiento Libre, Previo e Informado</strong> (CLPI) — o <em>Free, Prior
            and Informed Consent</em> (FPIC) en inglés — eleva el estándar de la consulta al
            requerir no solo diálogo sino consentimiento efectivo. Fue consagrado en la{' '}
            <strong>Declaración de Naciones Unidas sobre los Derechos de los Pueblos Indígenas</strong>{' '}
            (DNUDPI, 2007), adoptada por 143 países (Chile la adoptó en 2007).
          </p>
          <p>
            Cada componente del concepto tiene peso propio:
          </p>
          <ul>
            <li><strong>Libre</strong> — sin presión, manipulación ni incentivos que distorsionen la decisión.</li>
            <li><strong>Previo</strong> — antes de que se adopte la decisión, no después de que el proyecto ya esté aprobado.</li>
            <li><strong>Informado</strong> — con acceso a información completa, comprensible y en el idioma propio sobre el alcance, los riesgos y las alternativas del proyecto.</li>
            <li><strong>Consentimiento</strong> — no solo ser escuchado, sino que la comunidad pueda decir sí o no.</li>
          </ul>

          <h2 className="section-heading mt-8">¿Cuándo se aplica?</h2>
          <p>
            El Convenio 169 establece que la consulta es obligatoria cuando el Estado adopta:
          </p>
          <ul>
            <li>Medidas legislativas o administrativas susceptibles de afectar directamente a pueblos indígenas.</li>
            <li>Proyectos de exploración o explotación de recursos naturales (minería, hidroeléctricas, forestales) en territorios indígenas.</li>
            <li>Planes de desarrollo o inversión que impliquen traslados de comunidades.</li>
          </ul>
          <p>
            La Declaración de la ONU amplía el CLPI a cualquier proyecto que pueda afectar las
            tierras, territorios o recursos de los pueblos indígenas — incluyendo proyectos de
            energías renovables que, aunque "verdes", pueden desplazar comunidades.
          </p>

          <h2 className="section-heading mt-8">Consulta vs. CLPI: ¿cuál aplica?</h2>
          <p>
            La distinción es relevante en la práctica. La consulta del Convenio 169 obliga al
            Estado a buscar acuerdo de buena fe, pero no le otorga a la comunidad derecho de veto
            absoluto. El CLPI de la DNUDPI, en cambio, implica que ciertos proyectos — especialmente
            los que afectan irreversiblemente tierras sagradas o recursos vitales — requieren
            consentimiento expreso, lo que en la práctica equivale a un veto.
          </p>
          <p>
            Los tribunales internacionales (Corte IDH, Comité de la ONU) han ido convergiendo hacia
            el estándar CLPI cuando los proyectos implican afectaciones graves. La Corte
            Interamericana de Derechos Humanos, en el caso <em>Saramaka vs. Surinam</em> (2007),
            estableció que los grandes proyectos de desarrollo requieren consentimiento, no solo
            consulta.
          </p>

          <h2 className="section-heading mt-8">El caso de Chile</h2>
          <p>
            Chile ratificó el Convenio 169 en 2008, lo que lo convirtió en obligatorio. Sin embargo,
            la implementación ha sido cuestionada por comunidades indígenas y organismos
            internacionales. Los principales problemas identificados son:
          </p>
          <ul>
            <li>Procesos de consulta iniciados cuando el proyecto ya está aprobado.</li>
            <li>Falta de información en mapuzungún u otras lenguas originarias.</li>
            <li>Plazos insuficientes para que las comunidades deliberen internamente.</li>
            <li>Convocatoria de representantes no reconocidos por las propias comunidades.</li>
          </ul>
          <p>
            El Tribunal Constitucional chileno y la Corte Suprema han anulado proyectos por
            omisión de consulta, lo que ha consolidado jurisprudencia en la materia. Sin embargo,
            la falta de reconocimiento constitucional de los pueblos indígenas sigue siendo
            una brecha estructural.
          </p>

          <h2 className="section-heading mt-8">Preguntas frecuentes</h2>

          <h3>¿La Consulta Previa obliga a los Estados a aceptar lo que decidan las comunidades?</h3>
          <p>
            Depende del estándar aplicable. La consulta del Convenio 169 exige buena fe y
            búsqueda de acuerdo, pero no otorga veto absoluto. El CLPI, en cambio, sí puede
            implicar que ciertos proyectos que afectan de modo grave e irreversible los territorios
            requieran consentimiento expreso. La línea entre ambos estándares la van trazando
            los tribunales caso a caso.
          </p>

          <h3>¿Puede una empresa privada ser responsable por no consultar?</h3>
          <p>
            La obligación formal de consultar recae en el Estado, no directamente en la empresa.
            Sin embargo, los marcos internacionales de empresas y derechos humanos (Principios
            Rectores de la ONU, estándares del IFC) exigen que las empresas realicen su propia
            debida diligencia y obtengan el CLPI como condición para acceder a financiamiento
            internacional o mercados regulados.
          </p>

          <h3>¿Qué pasa si el Estado no consulta?</h3>
          <p>
            Las comunidades pueden impugnar el proyecto ante tribunales nacionales, denunciarlo
            ante la OIT o la Comisión Interamericana de Derechos Humanos, o recurrir al Relator
            Especial de la ONU sobre los Derechos de los Pueblos Indígenas. En Chile, la acción
            de protección y la nulidad de derecho público han sido utilizadas con éxito para
            frenar proyectos que omitieron la consulta.
          </p>

          <div className="mt-10 p-5 bg-neutral-50 rounded-lg border border-neutral-100">
            <p className="text-sm text-neutral-600 mb-3">
              Seguimos en tiempo real los casos de consulta previa y CLPI en América Latina,
              curados por IA.
            </p>
            <Link
              to="/issues/derechos-indigenas"
              className="inline-block text-sm font-medium text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Ver últimas noticias sobre derechos indígenas →
            </Link>
          </div>

        </div>
      </div>
    </>
  )
}
