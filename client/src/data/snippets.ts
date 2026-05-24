/**
 * Snippets — "always true" editorial statements per issue area.
 * One snippet is shown per day, rotating deterministically by date.
 * Each area has its own pool; the homepage uses the general pool.
 */

export interface Snippet {
  text: string
  source?: string // optional attribution (no URL — these are facts, not quotes)
}

// One deterministic snippet per day: dayIndex mod pool length
export function getDailySnippet(pool: Snippet[]): Snippet {
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  return pool[dayIndex % pool.length]
}

export const SNIPPETS_BY_ISSUE: Record<string, Snippet[]> = {
  'cambio-climatico': [
    { text: 'Los territorios indígenas albergan el 80% de la biodiversidad restante del planeta.', source: 'IPBES, 2019' },
    { text: 'Los pueblos indígenas cuidan el 22% de la superficie terrestre y protegen el 80% de los ecosistemas más saludables del mundo.', source: 'Forest Peoples Programme' },
    { text: 'Las comunidades indígenas son las primeras en sentir los efectos del cambio climático, a pesar de haber contribuido menos a sus causas.' },
    { text: 'Los conocimientos ecológicos tradicionales llevan siglos documentando cambios en climas, suelos y ciclos del agua.' },
    { text: 'Proteger los territorios indígenas es una de las estrategias más eficaces para capturar carbono y detener la deforestación.', source: 'World Resources Institute' },
  ],
  'derechos-indigenas': [
    { text: 'El Convenio 169 de la OIT garantiza el derecho a la consulta previa, libre e informada de los pueblos indígenas.' },
    { text: 'La Declaración de las Naciones Unidas sobre los Derechos de los Pueblos Indígenas fue adoptada en 2007 con 143 votos a favor.' },
    { text: 'Chile es uno de los pocos países de América Latina que aún no reconoce constitucionalmente a sus pueblos originarios.' },
    { text: 'El derecho a la tierra no es solo una demanda política: es la base material de la identidad, la cultura y la supervivencia de los pueblos indígenas.' },
    { text: 'La libre determinación de los pueblos indígenas está reconocida en el derecho internacional desde 1966, con los Pactos Internacionales de Derechos Humanos.' },
  ],
  'desarrollo-sostenible-y-autodeterminado': [
    { text: 'Los modelos económicos indígenas llevan siglos integrando sostenibilidad y comunidad como principios fundamentales.' },
    { text: 'El conocimiento tradicional indígena contiene soluciones para una agricultura más resiliente frente al clima.' },
    { text: 'La autonomía económica y la identidad cultural no son excluyentes: las comunidades indígenas que controlan sus territorios suelen tener mejores indicadores de bienestar.' },
    { text: 'La gestión comunitaria del agua, el bosque y la tierra por parte de pueblos indígenas produce resultados ambientales superiores a los modelos industriales en la misma área.', source: 'Rights and Resources Initiative' },
  ],
  'chile-indigena': [
    { text: 'Chile tiene diez pueblos indígenas reconocidos oficialmente, que representan cerca del 13% de la población.', source: 'Censo 2017, INE' },
    { text: 'El mapudungun, idioma del pueblo mapuche, es hablado por más de 200.000 personas en Chile y Argentina.' },
    { text: 'Los pueblos originarios de Chile llevan habitando estos territorios por más de 10.000 años.' },
    { text: 'El pueblo mapuche es el pueblo indígena más numeroso de Chile, con más de 1,7 millones de personas que se identifican como parte de él.', source: 'Censo 2017, INE' },
    { text: 'La Araucanía fue el último territorio de América del Sur en ser incorporado por la fuerza al Estado chileno, a fines del siglo XIX.' },
  ],
}

// General pool for the homepage (not tied to a specific issue)
export const SNIPPETS_GENERAL: Snippet[] = [
  { text: 'Las voces indígenas son fundamentales para construir políticas públicas justas y sostenibles.' },
  { text: 'La autonomía indígena no es un obstáculo al desarrollo: es su condición.' },
  { text: 'Los pueblos indígenas representan menos del 5% de la población mundial, pero protegen el 80% de la biodiversidad del planeta.', source: 'ONU, 2019' },
  { text: 'El diálogo intercultural es el primer paso hacia una sociedad más justa.' },
  { text: 'El reconocimiento de los derechos indígenas beneficia a toda la sociedad: más biodiversidad, más resiliencia y más diversidad cultural.' },
  { text: 'Cuando un idioma originario desaparece, se pierde una manera única de entender el mundo que tardó siglos en construirse.' },
  { text: 'Los pueblos indígenas han vivido en armonía con sus territorios por generaciones. Su conocimiento es parte del patrimonio de la humanidad.' },
]
