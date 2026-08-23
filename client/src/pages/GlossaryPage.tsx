import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'

const META = {
  title: 'Glosario de términos indígenas | Voces Indígenas',
  description:
    'Glosario de términos clave para entender las noticias sobre pueblos indígenas: palabras en mapuzungún, aymara, quechua y conceptos del derecho internacional indígena.',
  url: `${SEO.siteUrl}/glosario`,
}

interface GlossaryEntry {
  term: string
  origin: string
  definition: string
  related?: string[]
  seeAlso?: { label: string; href: string }
}

const ENTRIES: GlossaryEntry[] = [
  {
    term: 'Wallmapu',
    origin: 'Mapuzungún',
    definition:
      'Territorio ancestral del pueblo mapuche. Su nombre significa "país de alrededor" o "tierra que rodea". Abarca la zona centro-sur de Chile (desde el río Biobío hasta la Patagonia) y parte de Argentina. Es el centro de la identidad política, espiritual y cultural mapuche.',
    related: ['Mapuche', 'Mapuzungún'],
    seeAlso: { label: 'Guía sobre el pueblo Mapuche', href: '/guia/pueblo-mapuche' },
  },
  {
    term: 'Mapuche',
    origin: 'Mapuzungún',
    definition:
      '"Gente de la tierra" (mapu = tierra, che = gente). Pueblo indígena más numeroso de Chile y Argentina, con aproximadamente 1,8 millones de personas. Habitaron ancestralmente el Wallmapu y resistieron siglos de colonización española antes de ser sometidos militarmente en el siglo XIX.',
    related: ['Wallmapu', 'Mapuzungún', 'Machi'],
    seeAlso: { label: 'Guía sobre el pueblo Mapuche', href: '/guia/pueblo-mapuche' },
  },
  {
    term: 'Mapuzungún',
    origin: 'Mapuzungún',
    definition:
      '"Lengua de la tierra" (mapu = tierra, zungún = habla). Idioma del pueblo mapuche, hablado por aproximadamente 250.000 personas en Chile y Argentina. Enfrenta riesgos de extinción por la presión del español, aunque existen iniciativas activas de revitalización lingüística.',
    related: ['Mapuche', 'Wallmapu'],
  },
  {
    term: 'Machi',
    origin: 'Mapuzungún',
    definition:
      'Autoridad espiritual y sanadora del pueblo mapuche, generalmente mujer. La machi cumple funciones de mediación entre el mundo humano y el espiritual, realiza ceremonias de sanación (machitún) y es guardiana del conocimiento medicinal y ritual de la comunidad.',
    related: ['Nguillatún', 'Mapuche'],
  },
  {
    term: 'Nguillatún',
    origin: 'Mapuzungún',
    definition:
      'Ceremonia colectiva de rogativa mapuche, la más importante de su calendario ritual. Se realiza cada dos a cuatro años y convoca a comunidades enteras durante varios días. En ella se renueva el pacto entre el pueblo y las fuerzas del cosmos, y se pide por el bienestar de la comunidad y la tierra.',
    related: ['Machi', 'Mapuche'],
  },
  {
    term: 'Ixofillmogen',
    origin: 'Mapuzungún',
    definition:
      'Concepto mapuche que designa la diversidad de la vida (biodiversidad) como sistema de relaciones interdependientes. En la cosmovisión mapuche, los humanos forman parte de esta red, no son sus dueños. El concepto es central en los debates contemporáneos sobre derechos de la naturaleza.',
    related: ['Mapuche', 'Wallmapu'],
  },
  {
    term: 'CLPI / FPIC',
    origin: 'Derecho internacional',
    definition:
      'Consentimiento Libre, Previo e Informado (Free, Prior and Informed Consent). Estándar del derecho internacional que exige que los pueblos indígenas puedan dar o denegar su consentimiento antes de que se aprueben proyectos que afecten sus territorios o recursos. Consagrado en la Declaración de la ONU sobre los Derechos de los Pueblos Indígenas (2007).',
    related: ['Consulta Previa', 'DNUDPI'],
    seeAlso: { label: 'Guía sobre Consulta Previa y CLPI', href: '/guia/consulta-previa-fpic' },
  },
  {
    term: 'Consulta Previa',
    origin: 'Derecho internacional',
    definition:
      'Derecho de los pueblos indígenas a ser consultados por el Estado antes de que se adopten medidas legislativas o administrativas que puedan afectarlos. Regulado principalmente por el Convenio 169 de la OIT (1989). La consulta debe realizarse de buena fe, de manera apropiada y con la finalidad de llegar a un acuerdo.',
    related: ['CLPI / FPIC', 'Convenio 169'],
    seeAlso: { label: 'Guía sobre Consulta Previa y CLPI', href: '/guia/consulta-previa-fpic' },
  },
  {
    term: 'Convenio 169',
    origin: 'Derecho internacional',
    definition:
      'Convenio sobre pueblos indígenas y tribales de la Organización Internacional del Trabajo (OIT), adoptado en 1989. Es el principal instrumento internacional vinculante sobre derechos indígenas. Reconoce el derecho a la consulta previa, a la tierra y a la identidad cultural. Chile lo ratificó en 2008.',
    related: ['Consulta Previa', 'DNUDPI'],
  },
  {
    term: 'DNUDPI',
    origin: 'Derecho internacional',
    definition:
      'Declaración de las Naciones Unidas sobre los Derechos de los Pueblos Indígenas, adoptada en 2007 por la Asamblea General de la ONU. Reconoce el derecho a la libre determinación, al CLPI, a las tierras y territorios, y a la identidad cultural. No es vinculante como tratado, pero tiene peso político y normativo significativo.',
    related: ['CLPI / FPIC', 'Convenio 169'],
  },
  {
    term: 'Pacificación de la Araucanía',
    origin: 'Historia chilena',
    definition:
      'Nombre con que la historiografía oficial chilena denominó la ocupación militar del Wallmapu entre 1861 y 1883. El proceso implicó el desplazamiento forzoso de comunidades mapuche, la expropiación de sus tierras y su confinamiento en pequeñas reducciones. Es reconocido por historiadores y organizaciones mapuche como un proceso de despojo territorial.',
    related: ['Wallmapu', 'Mapuche'],
    seeAlso: { label: 'Guía sobre el pueblo Mapuche', href: '/guia/pueblo-mapuche' },
  },
  {
    term: 'Reducción',
    origin: 'Historia colonial / Chile',
    definition:
      'Pequeñas parcelas de tierra asignadas a comunidades indígenas tras la ocupación militar de sus territorios. En Chile, las reducciones mapuche fueron establecidas entre 1884 y 1929. Representaron una fracción mínima del territorio ancestral mapuche y son el origen de la precariedad territorial que persiste hasta hoy.',
    related: ['Pacificación de la Araucanía', 'Mapuche'],
  },
  {
    term: 'Ley Antiterrorista',
    origin: 'Derecho chileno',
    definition:
      'Ley N° 18.314 de Chile, que establece conductas terroristas y sus sanciones. Ha sido aplicada a comuneros mapuche acusados de quemas o sabotajes en el contexto del conflicto territorial en La Araucanía. Su aplicación ha sido criticada por organismos internacionales (ONU, Amnistía Internacional) por considerarla desproporcionada.',
    related: ['Pacificación de la Araucanía', 'Mapuche'],
  },
  {
    term: 'CONADI',
    origin: 'Institucionalidad chilena',
    definition:
      'Corporación Nacional de Desarrollo Indígena. Organismo público chileno creado por la Ley Indígena N° 19.253 (1993). Es responsable de la política indígena del Estado, administra el Fondo de Tierras y Aguas Indígenas y ejecuta programas de fomento cultural y productivo.',
    related: ['Ley Indígena'],
  },
  {
    term: 'Ley Indígena',
    origin: 'Derecho chileno',
    definition:
      'Ley N° 19.253 de Chile, promulgada en 1993. Reconoce los diez pueblos indígenas del país, protege las tierras indígenas y crea la CONADI. Es el principal marco legal de los derechos indígenas en Chile, pero es criticada por no otorgar reconocimiento constitucional ni autonomía real.',
    related: ['CONADI', 'Consulta Previa'],
    seeAlso: { label: 'Guía sobre pueblos indígenas de Chile', href: '/guia/pueblos-indigenas-chile' },
  },
  {
    term: 'Apu',
    origin: 'Quechua / Aymara',
    definition:
      'Divinidad o espíritu tutelar de las montañas en la cosmovisión andina (quechua y aymara). Los apus son considerados guardianes de los pueblos y fuentes de energía vital. La destrucción de cerros por minería en territorios aymara y quechua es vivida como una agresión espiritual, además de territorial.',
    related: ['Pachamama'],
  },
  {
    term: 'Pachamama',
    origin: 'Quechua / Aymara',
    definition:
      '"Madre Tierra" en quechua y aymara. Principio espiritual y filosófico que concibe a la tierra como un ser vivo y sagrado. Ha sido incorporado en las constituciones de Ecuador (2008) y Bolivia (2009) como sujeto de derechos. Es el fundamento cosmológico de muchas demandas indígenas contra proyectos extractivos.',
    related: ['Apu'],
  },
  {
    term: 'Moai',
    origin: 'Rapanui',
    definition:
      'Monolitos de piedra volcánica esculpidos por el pueblo rapanui en Isla de Pascua (Rapa Nui). Se estima que existen alrededor de 900. Representan ancestros divinizados (aringa ora) y son patrimonio de la humanidad. El debate sobre la repatriación de moais en museos extranjeros es parte de las demandas del pueblo rapanui.',
    related: ['Rapa Nui'],
  },
  {
    term: 'Rapa Nui',
    origin: 'Rapanui',
    definition:
      'Nombre propio de Isla de Pascua y del pueblo polinesio que la habita. El pueblo rapanui reivindica mayor autonomía política y control territorial sobre la isla, que pertenece a Chile pero se encuentra a 3.700 km del continente. Su lengua y cultura son de origen polinesio, no andino.',
    related: ['Moai'],
  },
  {
    term: 'Lickanantay',
    origin: 'Atacameño',
    definition:
      'Nombre propio del pueblo conocido oficialmente como "atacameño". Habitante ancestral del desierto de Atacama, incluyendo el Salar de Atacama, zona de intensa extracción de litio. La tensión entre las demandas de agua y tierra del pueblo lickanantay y la industria minera es uno de los conflictos indígenas más activos en Chile.',
  },
  {
    term: 'Kawésqar',
    origin: 'Kawésqar',
    definition:
      'Pueblo nómade del mar de los canales patagónicos, en el extremo sur de Chile. En situación crítica de extinción cultural. Su nombre significa "pueblo de la piel" en referencia a las pieles con que cubrían sus cuerpos para protegerse del frío patagónico. Quedan menos de diez hablantes con dominio nativo de la lengua.',
  },
  {
    term: 'Yagán',
    origin: 'Yagán',
    definition:
      'El pueblo más austral del planeta, habitante de Tierra del Fuego y el Cabo de Hornos. La última hablante nativa fluida del idioma yagán, Cristina Calderón, falleció en 2022. Su lengua y conocimiento es considerado patrimonio cultural inmaterial de la humanidad en riesgo de extinción irreversible.',
  },
]

const LETTERS = [...new Set(ENTRIES.map((e) => e.term[0].toUpperCase()))].sort()

export default function GlossaryPage() {
  const [filter, setFilter] = useState('')
  const [activeLetter, setActiveLetter] = useState<string | null>(null)

  const filtered = ENTRIES.filter((e) => {
    if (activeLetter) return e.term.toUpperCase().startsWith(activeLetter)
    if (filter.trim()) {
      const q = filter.toLowerCase()
      return (
        e.term.toLowerCase().includes(q) ||
        e.definition.toLowerCase().includes(q) ||
        e.origin.toLowerCase().includes(q)
      )
    }
    return true
  })

  // FAQ schema — first 8 entries
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: ENTRIES.slice(0, 8).map((e) => ({
      '@type': 'Question',
      name: `¿Qué significa "${e.term}"?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: e.definition,
      },
    })),
  }

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
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Glosario' },
          ]),
          faqSchema,
        ]}
      />

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">Referencia</span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            Glosario indígena
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Términos clave en mapuzungún, quechua, aymara y derecho internacional para entender las noticias que cubrimos.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="max-w-2xl mx-auto">

          {/* Search */}
          <div className="mb-6">
            <input
              type="search"
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setActiveLetter(null) }}
              placeholder="Buscar término o concepto…"
              className="w-full px-4 py-2.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent bg-neutral-50 focus:bg-white transition-colors"
              aria-label="Buscar en el glosario"
            />
          </div>

          {/* Letter filter */}
          <div className="flex flex-wrap gap-1.5 mb-8" role="group" aria-label="Filtrar por letra">
            <button
              onClick={() => { setActiveLetter(null); setFilter('') }}
              className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 ${!activeLetter && !filter ? 'bg-brand-600 text-white border-brand-600' : 'border-neutral-200 text-neutral-500 hover:border-brand-400 hover:text-brand-700'}`}
            >
              Todos
            </button>
            {LETTERS.map((l) => (
              <button
                key={l}
                onClick={() => { setActiveLetter(l); setFilter('') }}
                className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 ${activeLetter === l ? 'bg-brand-600 text-white border-brand-600' : 'border-neutral-200 text-neutral-500 hover:border-brand-400 hover:text-brand-700'}`}
                aria-pressed={activeLetter === l}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Entries */}
          {filtered.length === 0 ? (
            <p className="text-neutral-500 text-sm py-8 text-center">No se encontraron términos para tu búsqueda.</p>
          ) : (
            <dl className="space-y-8">
              {filtered.map((entry) => (
                <div key={entry.term} id={entry.term.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')}>
                  <dt className="flex flex-wrap items-baseline gap-3 mb-2">
                    <span className="text-lg font-bold text-neutral-900">{entry.term}</span>
                    <span className="text-xs text-brand-600 font-medium bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full">
                      {entry.origin}
                    </span>
                  </dt>
                  <dd className="text-sm text-neutral-700 leading-relaxed">
                    {entry.definition}
                  </dd>
                  {entry.related && entry.related.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-neutral-400">Ver también:</span>
                      {entry.related.map((r) => {
                        const anchor = r.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')
                        return (
                          <button
                            key={r}
                            onClick={() => {
                              setActiveLetter(null)
                              setFilter('')
                              setTimeout(() => {
                                document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }, 50)
                            }}
                            className="text-xs text-brand-800 hover:text-brand-900 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                          >
                            {r}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {entry.seeAlso && (
                    <div className="mt-2">
                      <Link
                        to={entry.seeAlso.href}
                        className="text-xs font-medium text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                      >
                        → {entry.seeAlso.label}
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </dl>
          )}

          <div className="mt-12 p-5 bg-neutral-50 rounded-lg border border-neutral-100">
            <p className="text-sm text-neutral-600 mb-3">
              ¿Falta un término? Escríbenos y lo incorporamos al glosario.
            </p>
            <Link
              to="/feedback"
              className="inline-block text-sm font-medium text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Sugerir un término →
            </Link>
          </div>

        </div>
      </div>
    </>
  )
}
