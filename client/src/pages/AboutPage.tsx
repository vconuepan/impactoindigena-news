import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { GITHUB_REPO_URL } from "../config";
import { SEO, CommonOgTags } from "../lib/seo";
import StructuredData from "../components/StructuredData";
import { buildBreadcrumbSchema } from "../lib/structured-data";

export default function AboutPage() {
  return (
    <>
      <Helmet>
        <title>Quiénes Somos - {SEO.siteName}</title>
        <meta
          name="description"
          content="Impacto Indígena nace de la historia de un pueblo que nunca fue conquistado. Una plataforma AI-native al amparo de la Corte IDH y el Convenio 169 OIT."
        />
        <meta property="og:title" content={`Quiénes Somos - ${SEO.siteName}`} />
        <meta
          property="og:description"
          content="Impacto Indígena nace de la historia de un pueblo que nunca fue conquistado."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/about`} />
        <link rel="canonical" href={`${SEO.siteUrl}/about`} />
        {CommonOgTags({})}
      </Helmet>
      <StructuredData
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: `Quiénes Somos - ${SEO.siteName}`,
            description:
              "Impacto Indígena nace de la historia de un pueblo que nunca fue conquistado. Una plataforma AI-native al amparo de la Corte IDH y el Convenio 169 OIT.",
            url: `${SEO.siteUrl}/about`,
            isPartOf: {
              "@type": "WebSite",
              name: SEO.siteName,
              url: SEO.siteUrl,
            },
          },
          buildBreadcrumbSchema([
            { name: "Inicio", url: SEO.siteUrl },
            { name: "Quiénes Somos" },
          ]),
        ]}
      />

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">Quiénes Somos</span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            Un pueblo que nunca<br className="hidden md:block" /> fue conquistado.
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Una plataforma que nace de esa historia. Construida con pueblos indígenas, no para ellos.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-none">

          {/* ── ACT I: El Yo ── */}
          <div className="not-prose flex items-center gap-4 mt-8 mb-6">
            <span className="font-fraunces text-5xl font-bold text-brand-200 leading-none select-none" aria-hidden="true">I</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600 mb-0.5">Historia de Origen</p>
              <h2 className="text-xl font-bold text-neutral-900 leading-snug">El pueblo que dijo no</h2>
            </div>
          </div>

          <p>
            En 1641, en el llano de Quilín, la Corona española firmó un tratado con el pueblo
            mapuche reconociendo el río Biobío como frontera. Era la primera vez que España
            reconocía la soberanía de un pueblo indígena mediante un acuerdo formal. Los mapuche
            no fueron conquistados. Resistieron durante más de tres siglos y forzaron al Imperio
            más poderoso del mundo a negociar.
          </p>
          <p>
            Esa resistencia no es solo historia: es el punto de partida de Impacto Indígena.
            Los pueblos indígenas no son grupos vulnerables que esperan ser defendidos. Son,
            y han sido siempre, protagonistas de su propio futuro. Representan menos del 5&nbsp;%
            de la población mundial, pero protegen más del 80&nbsp;% de la biodiversidad del
            planeta. Su conocimiento ancestral, su gobernanza propia y su relación con el
            territorio son contribuciones que el mundo necesita urgentemente.
          </p>

          <h3 className="section-heading mt-8">Fundador</h3>
          <p>
            <a href="https://www.linkedin.com/in/vconuepan/" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              <strong>Venancio Conuepan Mesías</strong>
            </a>{" "}
            es abogado mapuche, fundador de Impacto Indígena SpA y director ejecutivo de la
            Fundación Empresas Indígenas. Su trabajo se ha centrado en la gobernanza
            territorial, la mediación intercultural y el emprendimiento indígena — en construir
            instituciones propias, más que en pedir que otros las construyan por nosotros.
          </p>
          <p className="text-sm text-neutral-500">
            Trayectoria, reconocimientos y becas en{" "}
            <a href="https://www.linkedin.com/in/vconuepan/" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              LinkedIn →
            </a>
            {" · "}Contacto:{" "}
            <a href="mailto:venancio@fundacionkm.org" className="text-brand-800 hover:text-brand-700 underline">
              venancio@fundacionkm.org
            </a>
          </p>

          {/* ── ACT II: El Nosotros ── */}
          <div className="not-prose flex items-center gap-4 mt-12 mb-6">
            <span className="font-fraunces text-5xl font-bold text-brand-200 leading-none select-none" aria-hidden="true">II</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600 mb-0.5">La Comunidad</p>
              <h2 className="text-xl font-bold text-neutral-900 leading-snug">Dos anillos de protección legal</h2>
            </div>
          </div>

          <p>
            Impacto Indígena no opera en el vacío. Existe al amparo de dos marcos internacionales
            que protegen los derechos de los pueblos indígenas y generan obligaciones concretas
            para los Estados:
          </p>
        </div>

        <div className="not-prose grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
          {[
            {
              numero: "20",
              unidad: "estados",
              titulo: "Corte Interamericana de Derechos Humanos",
              texto: "Veinte países reconocen la jurisdicción contenciosa de la Corte IDH. Sus fallos sobre derechos indígenas generan res interpretata: todos los estados parte deben aplicar esa interpretación vía control de convencionalidad, incluso sin haber sido parte del caso.",
              color: "#C8473A",
            },
            {
              numero: "24",
              unidad: "países",
              titulo: "Convenio 169 de la OIT",
              texto: "El único tratado internacional vinculante sobre derechos de pueblos indígenas, ratificado por 24 países en cinco continentes: desde Chile y México hasta Nepal, Fiji y Luxemburgo. Establece el derecho a la consulta previa, libre e informada y la autonomía territorial.",
              color: "#0D5F3C",
            },
          ].map((item) => (
            <div
              key={item.titulo}
              className="rounded-xl p-6 border"
              style={{ backgroundColor: `${item.color}08`, borderColor: `${item.color}25` }}
            >
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="font-fraunces text-4xl font-bold leading-none" style={{ color: item.color }}>{item.numero}</span>
                <span className="text-sm text-neutral-500 font-medium">{item.unidad}</span>
              </div>
              <h3 className="font-bold text-neutral-800 mb-2 text-sm">{item.titulo}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{item.texto}</p>
            </div>
          ))}
        </div>

        <div className="prose max-w-none">
          <p>
            A estos dos marcos se suma la{" "}
            <strong>Declaración de las Naciones Unidas sobre los Derechos de los Pueblos
            Indígenas (UNDRIP)</strong>, adoptada en 2007, que establece los derechos
            colectivos e individuales de los pueblos indígenas en materia de cultura, identidad,
            educación, salud, empleo y territorio. Impacto Indígena cubre activamente la
            jurisprudencia que estos marcos generan y su implementación en los países signatarios.
          </p>

          <h3 className="section-heading mt-8">Impacto Indígena SpA</h3>
          <p>
            Esta plataforma es parte de{" "}
            <a href="https://www.impactoindigena.com" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              Impacto Indígena SpA
            </a>
            , una Empresa Social Indígena constituida en Chile en 2023 que promueve un
            cuádruple impacto positivo — económico, social, ambiental y cultural — para
            contribuir al fortalecimiento de la autonomía de los pueblos indígenas y visibilizar
            sus saberes para un desarrollo sostenible y autodeterminado.
          </p>

          <h3 className="section-heading mt-8">Red Indígena Colaborativa</h3>
          <p>
            Trabajamos en una red indígena colaborativa que articula capacidades, saberes y
            recursos junto a:
          </p>
          <ul>
            <li>Fundación Konwepang-Millakir por el respeto del mapu</li>
            <li>Fundación Empresas Indígenas</li>
            <li>Sociedad de Profesionales Conuepan y Millaquir Limitada</li>
            <li>Impacto Indígena SpA</li>
          </ul>

          <h3 className="section-heading mt-8">El Modelo R · E · D Indígena</h3>
          <p>
            Todo nuestro trabajo se articula en torno al modelo RED Indígena: una forma de
            impulsar transformación con identidad.
          </p>
        </div>

        <div className="not-prose grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
          {[
            {
              letra: "R",
              titulo: "Reconocer",
              texto: "Valoramos la riqueza cultural, espiritual y ecológica de los pueblos indígenas. Visibilizamos sus aportes y combatimos los estereotipos que perpetúan su exclusión.",
              color: "#34d399",
            },
            {
              letra: "E",
              titulo: "Empoderar",
              texto: "Fortalecemos liderazgos y estructuras de gobernanza indígena. Promovemos su participación efectiva en decisiones que afectan sus territorios y su futuro.",
              color: "#38bdf8",
            },
            {
              letra: "D",
              titulo: "Desarrollar",
              texto: "Impulsamos un desarrollo sostenible y autodeterminado. Respetamos sus modelos de vida y construimos soluciones en diálogo y colaboración.",
              color: "#a78bfa",
            },
          ].map((item) => (
            <div
              key={item.letra}
              className="rounded-xl p-6"
              style={{ backgroundColor: `${item.color}10`, border: `1px solid ${item.color}30` }}
            >
              <div
                className="text-5xl font-bold mb-3 leading-none"
                style={{ color: item.color }}
              >
                {item.letra}
              </div>
              <h3 className="font-bold text-neutral-800 mb-2">{item.titulo}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{item.texto}</p>
            </div>
          ))}
        </div>

        <div className="prose max-w-none">

          {/* ── ACT III: El Ahora ── */}
          <div className="not-prose flex items-center gap-4 mt-12 mb-6">
            <span className="font-fraunces text-5xl font-bold text-brand-200 leading-none select-none" aria-hidden="true">III</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600 mb-0.5">La Urgencia</p>
              <h2 className="text-xl font-bold text-neutral-900 leading-snug">Lo que el mundo no debería resolver sin ellos</h2>
            </div>
          </div>

          <p>
            La crisis climática, la pérdida de biodiversidad y los conflictos territoriales tienen
            algo en común: en cada uno de estos desafíos globales, los pueblos indígenas son
            parte esencial de la solución. No como víctimas que necesitan ayuda, sino como
            innovadores sociales que llevan milenios gestionando ecosistemas, construyendo
            gobernanza colectiva y manteniendo la diversidad cultural que hace a la humanidad
            más resiliente.
          </p>
          <p>
            Lo que hoy llamamos soluciones basadas en la naturaleza es la realidad cotidiana
            de la mayoría de los pueblos indígenas del mundo. La narrativa dominante, sin embargo,
            los presenta casi siempre desde la vulnerabilidad: una visión que, aunque bien
            intencionada, invisibiliza su liderazgo y los excluye de las decisiones que los afectan.
          </p>
          <p>
            <strong>Impacto Indígena News</strong> nace para cambiar esa narrativa. Usamos
            inteligencia artificial para monitorear fuentes especializadas en todo el mundo,
            analizar el impacto real de las noticias en los pueblos indígenas y presentar esa
            información de forma clara, accesible y sin publicidad. La elección es concreta:
            construir con los pueblos indígenas, o seguir construyendo sin ellos.
          </p>

          <h3 className="section-heading mt-8">Nuestros Proyectos</h3>
          <p>Iniciativas que transforman territorios y relaciones.</p>
        </div>

        <div className="not-prose grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
          {[
            {
              titulo: "Café Climático",
              texto: "Espacio de encuentro intercultural que promueve el diálogo entre juventudes, líderes indígenas, científicos y tomadores de decisión sobre cambio climático. Siete ediciones en La Araucanía, en parques, colegios y universidades.",
              accent: "#34d399",
            },
            {
              titulo: "Red Misión Nielol",
              texto: "Red de voluntariado indígena y no indígena que impulsa acciones de educación ambiental, restauración ecológica y cuidado del territorio, con base en el cerro Nielol de Temuco como símbolo de encuentro y resistencia cultural mapuche.",
              accent: "#38bdf8",
            },
            {
              titulo: "Programa Liderazgo Escolar",
              texto: "Iniciativa que fortalece el liderazgo de estudiantes indígenas en contextos escolares, promoviendo el orgullo cultural, la acción climática y el compromiso con sus comunidades.",
              accent: "#fbbf24",
            },
            {
              titulo: "Podcast Voces Indígenas",
              texto: "Serie digital donde personas indígenas comparten en primera voz sus historias, saberes y propuestas de cambio. Amplificamos voces silenciadas y contribuimos a una narrativa más diversa, digna y conectada con los territorios.",
              accent: "#a78bfa",
            },
          ].map((p) => (
            <div
              key={p.titulo}
              className="rounded-xl p-5 bg-neutral-50 border border-neutral-100"
              style={{ borderLeftColor: p.accent, borderLeftWidth: '3px' }}
            >
              <h3 className="font-bold text-neutral-800 mb-2">{p.titulo}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{p.texto}</p>
            </div>
          ))}
        </div>

        <div className="prose max-w-none">

          <h3 className="section-heading mt-10">Sobre esta plataforma</h3>
          <p>
            La plataforma fue desarrollada como una adaptación con enfoque exclusivo indígena
            del proyecto{" "}
            <a href="https://github.com/OdinMB/actually-relevant" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              Actually Relevant
            </a>
            , creado originalmente por{" "}
            <a href="https://www.linkedin.com/in/odinmuehlenbein/" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              Odin Mühlenbein
            </a>
            . El prototipo fue desarrollado en el marco de la cohorte{" "}
            <strong>LatAm AI 2025</strong> de{" "}
            <a href="https://changemakerxchange.ai" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              Changemakerxchange.ai
            </a>
            , con el apoyo de Odin como mentor y experto en inteligencia artificial del Ashoka AI
            Lab. El código es abierto y está disponible en{" "}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              GitHub
            </a>.
          </p>

        </div>

        <div className="prose max-w-none mt-12 pt-8 border-t border-neutral-200">
          <h2 className="section-heading">Explorar</h2>
          <ul className="space-y-2 my-4">
            <li>
              <Link to="/methodology" className="text-brand-800 hover:text-brand-700 font-normal">
                Metodología
              </Link>{" "}
              &mdash; Cómo seleccionamos las noticias, desde la fuente hasta la publicación
            </li>
            <li>
              <Link to="/privacy" className="text-brand-800 hover:text-brand-700 font-normal">
                Privacidad
              </Link>{" "}
              &mdash; Nuestro compromiso con tu privacidad e independencia
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
