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
          content="Impacto Indígena es una plataforma de noticias curada por IA que analiza el impacto global en los pueblos indígenas. Parte de Impacto Indígena SpA, empresa social indígena fundada por Venancio Conuepan Mesías."
        />
        <meta property="og:title" content={`Quiénes Somos - ${SEO.siteName}`} />
        <meta
          property="og:description"
          content="Impacto Indígena es una plataforma de noticias curada por IA que analiza el impacto global en los pueblos indígenas."
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
              "Impacto Indígena es una plataforma de noticias curada por IA que analiza el impacto global en los pueblos indígenas.",
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

      {/* Hero intro */}
      <div className="bg-neutral-900 text-white py-14 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">Quiénes Somos</span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            No solo hablamos sobre<br className="hidden md:block" /> pueblos indígenas.
          </h1>
          <p className="text-lg text-white/70 leading-relaxed">
            Somos pueblos indígenas. Y es tiempo de construir con nosotros, no sin nosotros.
          </p>
        </div>
      </div>

      <div className="page-section">
        <p className="page-intro !mt-8">
          Monitoreamos el mundo para encontrar noticias que importan a los pueblos indígenas: los desafíos que enfrentan en sus territorios y derechos, y las soluciones que están liderando para el planeta. Dos caras de la misma historia.
        </p>

        <div className="prose max-w-none">

          <h2 className="section-heading mt-8">La Historia</h2>
          <p>
            Los pueblos indígenas representan menos del 5% de la población mundial, pero protegen
            más del 80% de la biodiversidad del planeta. Sin embargo, la narrativa global los
            presenta casi siempre desde la vulnerabilidad: una visión que, aunque bien
            intencionada, no les permite alcanzar su máximo potencial ni contribuir con dignidad
            a transformar los desafíos globales que nos afectan a todos por igual.
          </p>
          <p>
            Lo que hoy llamamos soluciones basadas en la naturaleza es la realidad cotidiana de
            la mayoría de los pueblos indígenas del mundo. Su conocimiento ancestral, su
            gobernanza propia y su relación profunda con el territorio son contribuciones
            invaluables para enfrentar la crisis climática, la pérdida de biodiversidad y los
            retos de la convivencia global.
          </p>
          <p>
            <strong>Impacto Indígena News</strong> nace para cambiar esa narrativa. Siguiendo
            los principios de la narrativa pública de Marshall Ganz, creemos que cambiar una
            historia requiere amplificar historias reales: las de comunidades que resisten,
            innovan, lideran y construyen el futuro desde sus territorios. Usamos inteligencia
            artificial para monitorear fuentes especializadas en todo el mundo, analizar el
            impacto real de las noticias en los pueblos indígenas y presentar esa información
            de forma clara, accesible y sin publicidad.
          </p>

          <h2 className="section-heading mt-10">Impacto Indígena SpA</h2>
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

          <h2 className="section-heading mt-10">El Modelo R · E · D Indígena</h2>
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
          <p>
            El modelo RED es más que un enfoque: es una forma de regenerar el presente y
            co-crear un futuro justo con los pueblos indígenas, en beneficio de todas las
            personas y el planeta.
          </p>

          <h2 className="section-heading mt-10">Red Indígena Colaborativa</h2>
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

          <h2 className="section-heading mt-10">Nuestros Proyectos</h2>
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
              className="rounded-xl p-5"
              style={{ borderLeft: `3px solid ${p.accent}`, backgroundColor: `${p.accent}08` }}
            >
              <h3 className="font-bold text-neutral-800 mb-2">{p.titulo}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{p.texto}</p>
            </div>
          ))}
        </div>

        <div className="prose max-w-none">

          <h2 className="section-heading mt-10">Servicios para Empresas Responsables</h2>
          <p>
            Apoyamos a las empresas responsables en el diseño de estrategias efectivas para
            cumplir sus compromisos de respeto a los derechos humanos de los pueblos indígenas,
            mediante un enfoque práctico, integrado y basado en principios internacionales.{" "}
            <a href="https://www.impactoindigena.com" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              Conoce más en impactoindigena.com
            </a>.
          </p>

          <h2 className="section-heading mt-10">Fundador</h2>
          <p>
            <a href="https://www.linkedin.com/in/vconuepan/" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              <strong>Venancio Conuepan Mesías</strong>
            </a>{" "}
            es un abogado mapuche y consultor en sostenibilidad, fundador de Impacto Indígena
            SpA y Director Ejecutivo de la Fundación Empresas Indígenas. Con más de diez años
            de trayectoria, ha liderado proyectos en gobernanza territorial, mediación
            intercultural, acción climática y emprendimiento indígena.
          </p>
          <p>
            Ha representado a Chile en espacios globales como el Caucus Indígena Internacional
            sobre empresas y derechos, propiedad intelectual y cambio climático. Fue reconocido
            como uno de los 100 Jóvenes Líderes de Chile en 2014, y ha recibido becas y
            distinciones del Departamento de Estado de EE.UU., el Alto Comisionado de Naciones
            Unidas, One Young World y The Melton Foundation. Actualmente es becario de la
            Fundación Pacto Social y finaliza su Máster en Derecho Regulatorio en la
            Pontificia Universidad Católica de Chile.
          </p>
          <p>
            Contacto:{" "}
            <a href="mailto:venancio@impactoindigena.com" className="text-brand-800 hover:text-brand-700 underline">
              venancio@impactoindigena.com
            </a>
          </p>

          <h2 className="section-heading mt-10">Sobre esta plataforma</h2>
          <p>
            Impacto Indígena News es una plataforma de noticias curada por inteligencia
            artificial que monitorea fuentes especializadas en todo el mundo, analiza el impacto
            real de las noticias en los pueblos indígenas y presenta esa información de forma
            clara, accesible y sin publicidad.
          </p>
          <p>
            Su propósito es concreto: cambiar la narrativa global sobre los pueblos indígenas.
            No presentarlos como víctimas o grupos vulnerables que necesitan ser defendidos, sino
            como lo que realmente son: innovadores sociales, guardianes del conocimiento
            ancestral y protagonistas activos en la solución de los desafíos globales que nos
            afectan a todos. Construimos puentes entre pueblos indígenas, sociedad civil,
            empresas responsables y Estados, integrando el conocimiento ancestral con el
            desarrollo económico, la acción climática y la consolidación de la paz.
          </p>
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
            . Mientras Actually Relevant cura noticias relevantes para la humanidad en general,
            Impacto Indígena News adapta esa misma tecnología y pipeline de inteligencia
            artificial con un foco exclusivo en los pueblos indígenas del mundo: sus territorios,
            derechos, culturas, conocimientos y contribuciones. Una herramienta pensada para
            amplificar las voces invisibilizadas y demostrar que lo ancestral y lo moderno
            pueden y deben unirse.
          </p>
          <p>
            El prototipo fue desarrollado en el marco de la cohorte{" "}
            <strong>LatAm AI 2025</strong> de{" "}
            <a href="https://changemakerxchange.ai" target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              Changemakerxchange.ai
            </a>
            , con el apoyo de Odin como mentor de la cohorte y experto en inteligencia
            artificial del Ashoka AI Lab. El código es abierto y está disponible en{" "}
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
