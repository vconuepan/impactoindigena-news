import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

const META = {
  title: 'Guías sobre pueblos indígenas | Impacto Indígena',
  description:
    'Guías editoriales sobre los pueblos indígenas de América Latina: historia, territorios, derechos y cultura. Contexto profundo para entender las noticias que cubrimos.',
  url: `${SEO.siteUrl}/guia`,
}

const GUIDES = [
  {
    title: 'El pueblo Mapuche',
    description:
      'Historia, territorio, derechos y cultura del mayor pueblo indígena de Chile y Argentina. Qué es el Wallmapu, la lucha por la tierra y el mapuzungún.',
    href: '/guia/pueblo-mapuche',
    label: 'Chile · Argentina',
  },
  {
    title: 'Consulta Previa y CLPI',
    description:
      'Qué es el Consentimiento Libre, Previo e Informado, por qué obliga a los Estados y cómo se aplica a proyectos extractivos en territorios indígenas.',
    href: '/guia/consulta-previa-fpic',
    label: 'Derechos internacionales',
  },
  {
    title: 'Chile Intercultural',
    description:
      'Los diez pueblos reconocidos por la ley chilena: mapuche, aymara, rapanui, atacameño, quechua, colla, diaguita, kawésqar, yagán y lamas. Sus territorios y demandas.',
    href: '/guia/pueblos-indigenas-chile',
    label: 'Chile',
  },
]

export default function GuidesIndexPage() {
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

      <StructuredData
        data={[
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Guías' },
          ]),
        ]}
      />

      <div className="bg-neutral-900 text-white py-14 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">Contexto</span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            Guías editoriales
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Contexto profundo sobre los pueblos indígenas para entender las noticias que cubrimos.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="max-w-2xl mx-auto space-y-6">
          {GUIDES.map((guide) => (
            <Link
              key={guide.href}
              to={guide.href}
              className="block border border-neutral-200 rounded-xl p-6 hover:border-brand-300 hover:shadow-sm transition-all group focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="text-lg font-bold text-neutral-900 group-hover:text-brand-800 transition-colors leading-snug">
                  {guide.title}
                </h2>
                <span className="text-xs text-brand-600 font-medium whitespace-nowrap mt-0.5 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
                  {guide.label}
                </span>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">{guide.description}</p>
              <span className="inline-block mt-3 text-sm font-medium text-brand-800 group-hover:text-brand-800">
                Leer guía →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
