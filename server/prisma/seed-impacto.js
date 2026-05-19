import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {

  const issues = [
    {
      id: 'issue-clima-001',
      name: 'Pueblos Indígenas, Cambio Climático y Biodiversidad',
      slug: 'cambio-climatico',
      description: 'Cambio climático y protección de la biodiversidad en territorios indígenas',
      promptFactors: `a) Impacto del cambio climático en territorios, formas de vida y conocimientos tradicionales de pueblos indígenas.
b) Pérdida de biodiversidad, deforestación o degradación de ecosistemas en territorios indígenas.
c) Participación de pueblos indígenas en mecanismos internacionales de cambio climático (IPCC, COP, REDD+).
d) Iniciativas indígenas de conservación, restauración ecológica o gestión territorial sostenible.`,
      promptAntifactors: `- Noticias climáticas o ambientales sin conexión con pueblos indígenas.
- Proyectos de conservación que excluyen o desplazan a comunidades indígenas sin mencionarlo.`,
      promptRatings: `1-2: Impacto mínimo, mención tangencial de pueblos indígenas en contexto ambiental.
3-4: Impacto menor, eventos regionales con relevancia indirecta para comunidades indígenas.
5-6: Impacto moderado, afecta recursos naturales o modos de vida de comunidades específicas.
7-8: Impacto significativo, pérdida territorial, crisis ecosistémica o política climática con efecto directo en pueblos indígenas.
9-10: Impacto excepcional, amenaza existencial para comunidades o territorios indígenas, o hito histórico en reconocimiento de derechos ambientales indígenas.`,
      intro: 'Los pueblos indígenas son guardianes de más del 80% de la biodiversidad del planeta. El cambio climático y la degradación ambiental amenazan directamente sus territorios, culturas y formas de vida, mientras que sus conocimientos tradicionales son clave para la conservación.',
      evaluationIntro: 'Evaluamos la relevancia de noticias en esta categoría según tres criterios:',
      evaluationCriteria: JSON.stringify([
        'Impacto directo en territorios, recursos naturales o modos de vida de pueblos indígenas',
        'Cambios en políticas, acuerdos internacionales o marcos legales que afectan a pueblos indígenas en contextos ambientales',
        'Iniciativas o conocimientos indígenas que contribuyen a la conservación o adaptación climática',
      ]),
      makeADifference: JSON.stringify([]),
    },
    {
      id: 'issue-ddhh-002',
      name: 'Derechos Indígenas',
      slug: 'derechos-indigenas',
      description: 'Responsabilidad empresarial y derechos humanos de pueblos indígenas',
      promptFactors: `a) Violaciones de derechos humanos de pueblos indígenas por parte de empresas o proyectos de inversión.
b) Consentimiento libre, previo e informado (CLPI) y consulta indígena en proyectos extractivos o de infraestructura.
c) Responsabilidad empresarial y litigios relacionados con impactos en comunidades indígenas.
d) Mecanismos internacionales de derechos humanos que involucran a pueblos indígenas y empresas (ONU, OCDE).`,
      promptAntifactors: `- Noticias empresariales sin impacto en pueblos indígenas.
- Responsabilidad empresarial genérica sin conexión con derechos indígenas.`,
      promptRatings: `1-2: Impacto mínimo, mención marginal de pueblos indígenas en contexto empresarial.
3-4: Impacto menor, conflictos localizados o acuerdos de alcance limitado.
5-6: Impacto moderado, proyectos que afectan derechos de comunidades indígenas específicas.
7-8: Impacto significativo, violaciones graves de derechos, litigios o precedentes legales importantes.
9-10: Impacto excepcional, fallos históricos o acuerdos que redefinen la relación entre empresas y pueblos indígenas.`,
      intro: 'Los proyectos extractivos, energéticos e infraestructurales afectan desproporcionadamente a territorios indígenas. La responsabilidad empresarial, el consentimiento previo y los mecanismos de reparación son centrales para la justicia indígena.',
      evaluationIntro: 'Evaluamos la relevancia de noticias en esta categoría según tres criterios:',
      evaluationCriteria: JSON.stringify([
        'Impacto de actividades empresariales en derechos, tierras o bienestar de pueblos indígenas',
        'Cumplimiento o violación del consentimiento libre, previo e informado (CLPI)',
        'Precedentes legales o mecanismos de rendición de cuentas empresarial en contextos indígenas',
      ]),
      makeADifference: JSON.stringify([]),
    },
    {
      id: 'issue-emp-003',
      name: 'Desarrollo Sostenible y Autodeterminado',
      slug: 'desarrollo-sostenible-y-autodeterminado',
      description: 'Emprendimiento, economía y empresas de pueblos indígenas',
      promptFactors: `a) Iniciativas de emprendimiento, cooperativas o empresas creadas y lideradas por comunidades indígenas.
b) Políticas públicas de fomento al emprendimiento indígena o economía comunitaria.
c) Acceso a mercados, financiamiento y reconocimiento de productos y servicios indígenas.
d) Turismo indígena, economía circular y valorización de conocimientos tradicionales con fines económicos.`,
      promptAntifactors: `- Emprendimiento general sin conexión con pueblos indígenas.
- Apropiación cultural de productos indígenas sin beneficio para las comunidades.`,
      promptRatings: `1-2: Impacto mínimo, menciones tangenciales de economía indígena.
3-4: Impacto menor, iniciativas locales con alcance limitado.
5-6: Impacto moderado, modelos de negocio o políticas con potencial de replicación.
7-8: Impacto significativo, empresas o cooperativas indígenas con impacto regional o nacional.
9-10: Impacto excepcional, transformaciones económicas que fortalecen la autonomía y el bienestar de comunidades indígenas a gran escala.`,
      intro: 'El emprendimiento indígena combina innovación con identidad cultural y gestión comunitaria del territorio. Las empresas y cooperativas indígenas son motores de autonomía económica y preservación cultural.',
      evaluationIntro: 'Evaluamos la relevancia de noticias en esta categoría según tres criterios:',
      evaluationCriteria: JSON.stringify([
        'Impacto económico y social en comunidades indígenas',
        'Innovación en modelos de negocio que integran valores culturales y comunitarios',
        'Políticas o marcos legales que facilitan o dificultan el emprendimiento indígena',
      ]),
      makeADifference: JSON.stringify([]),
    },
    {
      id: 'issue-paz-004',
      name: 'Pueblos Indígenas, Conflictos, Reconciliación y Paz',
      slug: 'reconciliacion-y-paz',
      description: 'Conflictos, reconciliación y construcción de paz con pueblos indígenas',
      promptFactors: `a) Conflictos armados, violencia o represión estatal que afectan a comunidades indígenas.
b) Procesos de paz, diálogo intercultural o acuerdos de reconciliación que involucran a pueblos indígenas.
c) Líderes y defensores indígenas criminalizados, amenazados o asesinados.
d) Mecanismos de justicia indígena, justicia transicional o reparación histórica para pueblos indígenas.`,
      promptAntifactors: `- Conflictos sin impacto en pueblos indígenas.
- Procesos de paz que excluyen la participación indígena.`,
      promptRatings: `1-2: Impacto mínimo, conflictos localizados sin relevancia para derechos indígenas.
3-4: Impacto menor, tensiones regionales con impacto indirecto.
5-6: Impacto moderado, conflictos que afectan comunidades específicas o acuerdos de alcance regional.
7-8: Impacto significativo, violencia sistemática contra líderes indígenas o procesos de paz con dimensión indígena relevante.
9-10: Impacto excepcional, crisis humanitaria que afecta a pueblos indígenas o acuerdos históricos de reconciliación.`,
      intro: 'Los pueblos indígenas son afectados de manera desproporcionada por conflictos armados, represión estatal y criminalización de sus líderes. La paz duradera requiere reconocimiento de sus derechos y participación en los procesos de diálogo.',
      evaluationIntro: 'Evaluamos la relevancia de noticias en esta categoría según tres criterios:',
      evaluationCriteria: JSON.stringify([
        'Impacto directo en la seguridad, vida o derechos de comunidades y líderes indígenas',
        'Avances o retrocesos en procesos de diálogo, reconciliación o justicia con pueblos indígenas',
        'Precedentes en mecanismos de justicia indígena o reparación histórica',
      ]),
      makeADifference: JSON.stringify([]),
    },
    {
      id: 'issue-chile-005',
      name: 'Pueblos Indígenas de Chile',
      slug: 'chile-indigena',
      description: 'Noticias sobre derechos, territorios, políticas y comunidades de los pueblos indígenas en Chile',
      promptFactors: `⚠️ RESTRICCIÓN GEOGRÁFICA ABSOLUTA: Este issue es EXCLUSIVAMENTE para noticias cuyo tema central ocurre en Chile o involucra a pueblos indígenas chilenos. Una noticia de EE.UU., Canadá, Australia, México, Brasil, Nueva Zelanda u otro país — aunque trate sobre derechos indígenas, territorios, ríos o acuerdos con el Estado — NUNCA debe clasificarse aquí. Para esas noticias usa derechos-indigenas, cambio-climatico u otro issue apropiado.

a) Derechos territoriales y de tierras: procesos de restitución, litigios, ocupaciones y acuerdos con el Estado chileno que afectan a comunidades mapuche, aymara, rapa nui u otros pueblos.
b) Consulta indígena y Convenio 169 OIT: aplicación, incumplimiento o avances en la consulta previa, libre e informada en proyectos que afectan a comunidades en Chile.
c) Evaluación ambiental y proyectos de inversión: impactos de proyectos mineros, energéticos, forestales o de infraestructura en territorios indígenas chilenos; resistencias y negociaciones.
d) Políticas públicas del Estado chileno: acciones de CONADI, Ministerio de Desarrollo Social, planes de reparación, programas de fomento o políticas de seguridad que afectan a pueblos originarios.
e) Reconocimiento constitucional: debates, avances o retrocesos en el reconocimiento constitucional de pueblos indígenas y sus derechos colectivos en Chile.
f) Situación de pueblos específicos: mapuche (incluyendo warriache/mapuche urbano), aymara, rapa nui, kawésqar, atacameño/likan antai, diaguita, chango, colla, quechua, yagán; sus organizaciones y demandas.
g) Ley Lafkenche y derechos costeros: uso y gestión del borde costero por comunidades indígenas, espacios costeros marinos de pueblos originarios (ECMPO).
h) Emprendimiento y economía indígena en Chile: empresas, cooperativas y proyectos productivos de comunidades chilenas.
i) Figuras y patrimonio histórico: noticias relacionadas con Venancio Coñuepan, líderes históricos y patrimonio cultural de pueblos indígenas de Chile.`,
      promptAntifactors: `- ❌ NUNCA: noticias de pueblos indígenas de EE.UU., Canadá, Australia, México, Brasil, Nueva Zelanda u otros países — aunque hablen de derechos, territorios o ríos. Usa derechos-indigenas u otro issue.
- Noticias de política nacional chilena sin impacto directo en comunidades indígenas.
- Noticias de turismo o cultura que no abordan derechos, impacto o autonomía de comunidades.
- Eventos o actividades folclóricas sin relevancia para los derechos o bienestar de comunidades.`,
      promptRatings: `1-2: Impacto mínimo, menciones marginales de pueblos indígenas sin relevancia para sus derechos o bienestar en Chile.
3-4: Impacto menor, noticias con relevancia indirecta o periférica para comunidades indígenas chilenas, eventos locales de alcance limitado.
5-6: Impacto moderado, noticias que afectan derechos, tierras o políticas de comunidades indígenas a nivel regional; conflictos en curso o procesos en desarrollo.
7-8: Impacto significativo, decisiones o eventos que afectan directamente derechos territoriales, constitucionales o económicos de pueblos indígenas en Chile; precedentes legales o políticos relevantes.
9-10: Impacto excepcional, hitos históricos para los derechos de pueblos indígenas en Chile: fallos judiciales históricos, reconocimiento constitucional efectivo, restitución masiva de tierras, crisis humanitaria o acuerdos de paz.`,
      intro: 'Chile es hogar de 11 pueblos indígenas reconocidos —mapuche, aymara, rapa nui, likan antai, quechua, colla, diaguita, kawésqar, yagán, chango y ona— que representan el 12,8% de la población. Sus demandas de tierras, la consulta indígena, el reconocimiento constitucional y la relación con el Estado son temas de primera importancia para la justicia y el futuro del país.',
      evaluationIntro: 'Evaluamos la relevancia de las noticias sobre pueblos indígenas de Chile con base en tres criterios:',
      evaluationCriteria: JSON.stringify([
        'Impacto directo en derechos territoriales, tierras, recursos naturales o seguridad de comunidades indígenas en Chile',
        'Cambios en políticas del Estado, legislación, jurisprudencia o reconocimiento constitucional que afectan a pueblos originarios chilenos',
        'Relevancia para la autonomía, el emprendimiento, la cultura o el bienestar de comunidades indígenas en Chile',
      ]),
      makeADifference: JSON.stringify([
        { label: 'CONADI', url: 'https://www.conadi.gob.cl/' },
        { label: 'Instituto Nacional de Derechos Humanos', url: 'https://www.indh.cl/' },
      ]),
    },
  ];

  for (const issue of issues) {
    await prisma.issue.upsert({
      where: { slug: issue.slug },
      update: {
        name: issue.name,
        description: issue.description,
        promptFactors: issue.promptFactors,
        promptAntifactors: issue.promptAntifactors,
        promptRatings: issue.promptRatings,
        intro: issue.intro,
        evaluationIntro: issue.evaluationIntro,
        evaluationCriteria: issue.evaluationCriteria,
        makeADifference: issue.makeADifference,
      },
      create: {
        name: issue.name,
        slug: issue.slug,
        description: issue.description,
        promptFactors: issue.promptFactors,
        promptAntifactors: issue.promptAntifactors,
        promptRatings: issue.promptRatings,
        intro: issue.intro,
        evaluationIntro: issue.evaluationIntro,
        evaluationCriteria: issue.evaluationCriteria,
        makeADifference: issue.makeADifference,
      },
    });
    console.log('issue:', issue.name);
  }

  // Feeds: { title, rssUrl, slug (issue slug), language, region }
  // NOTE: slugs must match the actual DB issue slugs exactly.
  const feeds = [
    // CAMBIO CLIMÁTICO Y BIODIVERSIDAD
    { title: 'Mongabay', rssUrl: 'https://news.mongabay.com/feed/', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'Mongabay – Indigenous Peoples', rssUrl: 'https://news.mongabay.com/list/indigenous-peoples/feed/', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'Mongabay – Biodiversity', rssUrl: 'https://news.mongabay.com/list/biodiversity/feed/', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'Carbon Brief', rssUrl: 'https://www.carbonbrief.org/feed', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'The Guardian – Environment', rssUrl: 'https://www.theguardian.com/environment/rss', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'The Guardian – Climate', rssUrl: 'https://www.theguardian.com/environment/climate-change/rss', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'Climate Home News', rssUrl: 'https://www.climatechangenews.com/feed/', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'IUCN News', rssUrl: 'https://www.iucn.org/news/rss.xml', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'WWF News', rssUrl: 'https://www.worldwildlife.org/stories.rss', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'Indigenous Climate Hub', rssUrl: 'https://indigenousclimatehub.ca/feed', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'UN News – Pueblos Indígenas', rssUrl: 'https://news.un.org/feed/subscribe/es/news/topic/indigenous-peoples/feed/rss.xml', slug: 'cambio-climatico', language: 'es', region: 'global' },
    { title: 'UN News – Cambio Climático', rssUrl: 'https://news.un.org/feed/subscribe/es/news/topic/climate-change/feed/rss.xml', slug: 'cambio-climatico', language: 'es', region: 'global' },
    { title: 'UNEP', rssUrl: 'https://www.unep.org/rss.xml', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'UNFCCC', rssUrl: 'https://unfccc.int/rss.xml', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'Survival International', rssUrl: 'https://www.survivalinternational.org/news/rss', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'CBD – Biodiversidad', rssUrl: 'https://www.cbd.int/rss/news.xml', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'IPBES', rssUrl: 'https://ipbes.net/rss.xml', slug: 'cambio-climatico', language: 'en', region: 'global' },
    { title: 'Servindi', rssUrl: 'https://www.servindi.org/rss.xml', slug: 'cambio-climatico', language: 'es', region: 'latin_america' },

    // EMPRESAS, DERECHOS HUMANOS Y PUEBLOS INDÍGENAS
    { title: 'Business and Human Rights Resource Centre', rssUrl: 'https://www.business-humanrights.org/en/rss/', slug: 'derechos-indigenas', language: 'en', region: 'global' },
    { title: 'Global Witness', rssUrl: 'https://www.globalwitness.org/en/feed/', slug: 'derechos-indigenas', language: 'en', region: 'global' },
    { title: 'Amazon Watch', rssUrl: 'https://amazonwatch.org/feed', slug: 'derechos-indigenas', language: 'en', region: 'latin_america' },
    { title: 'IWGIA News', rssUrl: 'https://www.iwgia.org/en/news.feed', slug: 'derechos-indigenas', language: 'en', region: 'global' },
    { title: 'Servindi – Derechos', rssUrl: 'https://www.servindi.org/feed', slug: 'derechos-indigenas', language: 'es', region: 'latin_america' },
    { title: 'Debates Indígenas', rssUrl: 'https://debatesindigenas.org/feed', slug: 'derechos-indigenas', language: 'es', region: 'latin_america' },
    { title: 'IPRI', rssUrl: 'https://iprights.org/feed', slug: 'derechos-indigenas', language: 'en', region: 'global' },
    { title: 'OHCHR', rssUrl: 'https://www.ohchr.org/en/rss/latest-news', slug: 'derechos-indigenas', language: 'en', region: 'global' },
    { title: 'UN DESA – Indigenous', rssUrl: 'https://social.desa.un.org/rss.xml', slug: 'derechos-indigenas', language: 'en', region: 'global' },
    { title: 'UN News – Derechos Humanos', rssUrl: 'https://news.un.org/feed/subscribe/es/news/topic/human-rights/feed/rss.xml', slug: 'derechos-indigenas', language: 'es', region: 'global' },
    { title: 'NACLA', rssUrl: 'https://nacla.org/feed', slug: 'derechos-indigenas', language: 'en', region: 'latin_america' },
    { title: 'Al Jazeera – Indigenous', rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml', slug: 'derechos-indigenas', language: 'en', region: 'global' },
    { title: 'Indian Country Today', rssUrl: 'https://ictnews.org/feed', slug: 'derechos-indigenas', language: 'en', region: 'global' },
    { title: 'Cultural Survival', rssUrl: 'https://www.culturalsurvival.org/rss.xml', slug: 'derechos-indigenas', language: 'en', region: 'global' },

    // EMPRENDIMIENTO Y EMPRESAS INDÍGENAS
    { title: 'CAMSC', rssUrl: 'https://camsc.ca/feed/', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'en', region: 'global' },
    { title: 'CCIB', rssUrl: 'https://www.ccib.ca/feed/', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'en', region: 'global' },
    { title: 'Indigenous Services Canada', rssUrl: 'https://www.isc-sac.gc.ca/eng/rss/news-releases.xml', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'en', region: 'global' },
    { title: 'UNDP', rssUrl: 'https://www.undp.org/rss.xml', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'en', region: 'global' },
    { title: 'First Peoples Worldwide', rssUrl: 'https://firstpeoples.org/feed/', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'en', region: 'global' },
    { title: 'UNCTAD', rssUrl: 'https://unctad.org/rss.xml', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'en', region: 'global' },
    { title: 'ProChile – Pueblos Originarios', rssUrl: 'https://www.prochile.gob.cl/feed/', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'es', region: 'latin_america' },
    { title: 'World Bank – LAC', rssUrl: 'https://blogs.worldbank.org/latinamerica/rss.xml', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'en', region: 'latin_america' },
    { title: 'ILO – Indigenous Peoples', rssUrl: 'https://www.ilo.org/rss/topic/indigenous.xml', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'en', region: 'global' },

    // RECONCILIACIÓN Y PAZ
    { title: 'Front Line Defenders', rssUrl: 'https://www.frontlinedefenders.org/en/rss', slug: 'reconciliacion-y-paz', language: 'en', region: 'global' },
    { title: 'Amnesty International', rssUrl: 'https://www.amnesty.org/en/latest/news/feed/', slug: 'reconciliacion-y-paz', language: 'en', region: 'global' },
    { title: 'Assembly of First Nations', rssUrl: 'https://afn.ca/feed/', slug: 'reconciliacion-y-paz', language: 'en', region: 'global' },
    { title: 'BC Gov – Reconciliation', rssUrl: 'https://news.gov.bc.ca/ministries/indigenous-relations-and-reconciliation/feed', slug: 'reconciliacion-y-paz', language: 'en', region: 'global' },
    { title: 'Yellowhead Institute', rssUrl: 'https://yellowheadinstitute.org/feed/', slug: 'reconciliacion-y-paz', language: 'en', region: 'global' },
    { title: 'NCTR', rssUrl: 'https://nctr.ca/feed/', slug: 'reconciliacion-y-paz', language: 'en', region: 'global' },
    { title: 'IWGIA – News & Alerts', rssUrl: 'https://iwgia.org/en/news-alerts?format=feed', slug: 'reconciliacion-y-paz', language: 'en', region: 'global' },
    { title: 'Reconciliation Australia', rssUrl: 'https://www.reconciliation.org.au/feed/', slug: 'reconciliacion-y-paz', language: 'en', region: 'global' },
    { title: 'Mapuexpress', rssUrl: 'https://www.mapuexpress.org/feed/', slug: 'reconciliacion-y-paz', language: 'es', region: 'latin_america' },

    // PUEBLOS INDÍGENAS DE CHILE
    { title: 'Mapuexpress', rssUrl: 'https://www.mapuexpress.org/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Mapuche Diario', rssUrl: 'https://www.mapuchediario.cl/feed', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'El Mostrador', rssUrl: 'https://www.elmostrador.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'CIPER Chile', rssUrl: 'https://ciperchile.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Radio Bio Bio', rssUrl: 'https://www.biobiochile.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'La Tercera', rssUrl: 'https://www.latercera.com/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Austral Temuco', rssUrl: 'https://www.australtemuco.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'El Desconcierto', rssUrl: 'https://www.eldesconcierto.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'IWGIA – Chile', rssUrl: 'https://iwgia.org/es/chile?format=feed', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Pueblos Originarios – Gob. Chile', rssUrl: 'https://www.pueblosoriginarios.gob.cl/feed', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Ministerio Culturas – Pueblos Originarios', rssUrl: 'https://www.cultura.gob.cl/pueblosoriginarios/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'CONADI', rssUrl: 'https://www.conadi.gob.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Google News — CONADI', rssUrl: 'https://news.google.com/rss/search?q=CONADI&hl=es-419&gl=CL&ceid=CL:es-419', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Google News — Pueblos Indígenas Chile', rssUrl: 'https://news.google.com/rss/search?q=pueblos+ind%C3%ADgenas+Chile&hl=es-419&gl=CL&ceid=CL:es-419', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Google News — Mapuche', rssUrl: 'https://news.google.com/rss/search?q=mapuche&hl=es-419&gl=CL&ceid=CL:es-419', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    // Medios chilenos indígenas adicionales
    { title: 'Azkintuwe', rssUrl: 'https://www.azkintuwe.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Werken Kurruf', rssUrl: 'https://www.werkenkurruf.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Wefkvletun', rssUrl: 'https://wefkvletun.cl/feed/', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Google News — Pueblo Mapuche', rssUrl: 'https://news.google.com/rss/search?q=%22pueblo+mapuche%22&hl=es-419&gl=CL&ceid=CL:es-419', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    { title: 'Google News — Convenio 169', rssUrl: 'https://news.google.com/rss/search?q=%22convenio+169%22+Chile&hl=es-419&gl=CL&ceid=CL:es-419', slug: 'chile-indigena', language: 'es', region: 'latin_america' },
    // LatAm: Bolivia, Perú, México
    { title: 'Erbol (Bolivia)', rssUrl: 'https://erbol.com.bo/feed', slug: 'derechos-indigenas', language: 'es', region: 'latin_america' },
    { title: 'Google News — Pueblos Indígenas Bolivia', rssUrl: 'https://news.google.com/rss/search?q=pueblos+ind%C3%ADgenas+Bolivia&hl=es-419&gl=BO&ceid=BO:es-419', slug: 'derechos-indigenas', language: 'es', region: 'latin_america' },
    { title: 'Google News — Pueblos Indígenas Perú', rssUrl: 'https://news.google.com/rss/search?q=pueblos+ind%C3%ADgenas+Per%C3%BA&hl=es-419&gl=PE&ceid=PE:es-419', slug: 'derechos-indigenas', language: 'es', region: 'latin_america' },
    { title: 'Google News — Pueblos Indígenas México', rssUrl: 'https://news.google.com/rss/search?q=pueblos+ind%C3%ADgenas+M%C3%A9xico&hl=es-419&gl=MX&ceid=MX:es-419', slug: 'derechos-indigenas', language: 'es', region: 'latin_america' },
    { title: 'Mongabay LatAm – Pueblos Indígenas', rssUrl: 'https://es.mongabay.com/tag/pueblos-indigenas/feed/', slug: 'cambio-climatico', language: 'es', region: 'latin_america' },
    { title: 'Diálogo Chino LatAm', rssUrl: 'https://dialogochino.net/es/feed/', slug: 'desarrollo-sostenible-y-autodeterminado', language: 'es', region: 'latin_america' },

    // Foro Permanente de Cuestiones Indígenas ONU (UNPFII)
    // Google News indexa cobertura activa desde UNESCO, OTCA, medios regionales
    { title: 'Google News — Foro Permanente ONU', rssUrl: 'https://news.google.com/rss/search?q=%22foro+permanente%22+ind%C3%ADgenas&hl=es-419&gl=MX&ceid=MX:es-419', slug: 'derechos-indigenas', language: 'es', region: 'global' },
    { title: 'Google News — UNPFII', rssUrl: 'https://news.google.com/rss/search?q=UNPFII+%22pueblos+ind%C3%ADgenas%22&hl=es-419&gl=MX&ceid=MX:es-419', slug: 'derechos-indigenas', language: 'es', region: 'global' },
    // DISD — UN Division for Inclusive Social Development (scraped, no RSS feed)
    // The crawler detects this URL and routes to the cheerio scraper instead of RSS parser
    { title: 'UNPFII — UN Division for Inclusive Social Development', rssUrl: 'https://social.desa.un.org/issues/indigenous-peoples/news', slug: 'derechos-indigenas', language: 'en', region: 'global' },
  ];

  for (const feed of feeds) {
    const issue = await prisma.issue.findUnique({ where: { slug: feed.slug } });
    if (!issue) {
      console.log(`  Issue not found for slug: ${feed.slug}, skipping feed: ${feed.title}`);
      continue;
    }
    await prisma.feed.upsert({
      where: { rssUrl: feed.rssUrl },
      update: { title: feed.title, issueId: issue.id },
      create: {
        title: feed.title,
        rssUrl: feed.rssUrl,
        issueId: issue.id,
        language: feed.language,
        region: feed.region,
      },
    });
    console.log(`  feed: ${feed.title}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
