/**
 * A que FAMILIA pertenece un User-Agent: navegador, o una de las clases de
 * cliente automatizado.
 *
 * POR QUE EXISTE (20-nov-2026). Hasta hoy la analitica tenia una sola pregunta
 * -¿es robot?- y lo que respondia «si» se descartaba sin contarse en ninguna
 * parte. Medido ese dia, el filtro descartaba el 51 % de los beacons y el panel
 * no lo mostraba. Las familias permiten contar aparte lo que se tira, y
 * distinguir lo que es buena noticia (alguien compartio un enlace: vista previa)
 * de lo que no lo es. Diagnostico en docs/propuesta-analytics-bots.md.
 *
 * `isBot` (analyticsVisitor.ts) es exactamente `familia !== 'navegador'`, asi
 * que esta lista ES la lista de robots: no hay dos que mantener.
 *
 * El User-Agent lo escribe el cliente y se falsifica facil. Esto clasifica lo
 * que el cliente DECLARA; quien miente diciendo ser Chrome cae en «navegador», y
 * quien dice ser Googlebot sin serlo lo atrapa `verifySearchBot.ts`.
 */

export type UaFamily =
  | 'navegador'
  | 'buscador'          // indexan para un buscador: traen lectores
  | 'ia_busqueda'       // asistentes que buscan y citan con enlace
  | 'ia_entrenamiento'  // descargan para entrenar modelos
  | 'vista_previa'      // arman la tarjeta de un enlace compartido en chat o redes
  | 'seo_monitoreo'     // herramientas de SEO, rendimiento y disponibilidad
  | 'automatizacion'    // navegadores sin pantalla y librerias de programacion
  | 'otro_robot'        // se declara robot pero no esta en ninguna lista
  | 'sin_ua'            // no manda User-Agent: ningun navegador real hace eso

export interface UaClass {
  family: UaFamily
  /** Nombre canonico del agente (cardinalidad acotada: viene de esta lista). '' para navegador. */
  agent: string
}

/**
 * [token en minusculas que se busca dentro del UA, nombre que se registra].
 * El orden importa: se prueba de arriba abajo y gana el primero, asi que los
 * tokens especificos van antes que los genericos ('bot', 'spider').
 */
const GRUPOS: Array<[UaFamily, Array<[string, string]>]> = [
  ['ia_busqueda', [
    ['oai-searchbot', 'OAI-SearchBot'],
    ['chatgpt-user', 'ChatGPT-User'],
    ['perplexity', 'PerplexityBot'],
    ['claude-searchbot', 'Claude-SearchBot'],
    ['claude-user', 'Claude-User'],
    ['claude-web', 'Claude-Web'],
  ]],
  ['ia_entrenamiento', [
    ['gptbot', 'GPTBot'],
    ['claudebot', 'ClaudeBot'],
    ['anthropic-ai', 'anthropic-ai'],
    ['ccbot', 'CCBot'],
    ['bytespider', 'Bytespider'],
    ['amazonbot', 'Amazonbot'],
    ['meta-externalagent', 'meta-externalagent'],
    ['applebot-extended', 'Applebot-Extended'],
  ]],
  ['vista_previa', [
    // Telegram antes que X: su User-Agent real es «TelegramBot (like TwitterBot)».
    ['telegrambot', 'Telegram'],
    ['facebookexternalhit', 'Facebook'],
    ['facebot', 'Facebook'],
    ['twitterbot', 'X (Twitter)'],
    ['slackbot', 'Slack'],
    ['discordbot', 'Discord'],
    ['whatsapp', 'WhatsApp'],
    ['linkedinbot', 'LinkedIn'],
    ['embedly', 'Embedly'],
    ['redditbot', 'Reddit'],
    ['skypeuripreview', 'Skype'],
  ]],
  ['buscador', [
    ['googlebot', 'Googlebot'],
    ['google-inspectiontool', 'Google-InspectionTool'],
    ['storebot-google', 'Storebot-Google'],
    ['adsbot', 'AdsBot-Google'],
    ['mediapartners', 'Mediapartners-Google'],
    ['apis-google', 'APIs-Google'],
    ['feedfetcher', 'FeedFetcher-Google'],
    ['bingbot', 'Bingbot'],
    ['bingpreview', 'BingPreview'],
    ['duckduckbot', 'DuckDuckBot'],
    ['yandex', 'YandexBot'],
    ['baiduspider', 'Baiduspider'],
    ['applebot', 'Applebot'],
    ['petal', 'PetalBot'],
    ['slurp', 'Yahoo Slurp'],
  ]],
  ['seo_monitoreo', [
    ['semrush', 'SemrushBot'],
    ['ahrefs', 'AhrefsBot'],
    ['mj12', 'MJ12bot'],
    ['dotbot', 'DotBot'],
    ['dataforseo', 'DataForSeoBot'],
    ['screaming frog', 'Screaming Frog'],
    ['sitebulb', 'Sitebulb'],
    ['serpstat', 'Serpstat'],
    ['chrome-lighthouse', 'Lighthouse'],
    ['pagespeed', 'PageSpeed'],
    ['gtmetrix', 'GTmetrix'],
    ['pingdom', 'Pingdom'],
    ['uptimerobot', 'UptimeRobot'],
  ]],
  ['automatizacion', [
    ['headlesschrome', 'HeadlessChrome'],
    ['phantomjs', 'PhantomJS'],
    ['puppeteer', 'Puppeteer'],
    ['playwright', 'Playwright'],
    ['python-requests', 'python-requests'],
    ['scrapy', 'Scrapy'],
    ['curl/', 'curl'],
    ['wget', 'Wget'],
    ['go-http-client', 'Go-http-client'],
    ['okhttp', 'okhttp'],
    ['java/', 'Java'],
    ['node-fetch', 'node-fetch'],
    ['axios/', 'axios'],
    ['libwww-perl', 'libwww-perl'],
    ['httpclient', 'HttpClient'],
    ['guzzle', 'Guzzle'],
  ]],
  ['otro_robot', [
    ['bot', 'otro (bot)'],
    ['crawler', 'otro (crawler)'],
    ['crawling', 'otro (crawler)'],
    ['spider', 'otro (spider)'],
  ]],
]

/** Todos los tokens, en orden de prueba. Exportado para las pruebas. */
export const TOKENS_DE_ROBOT: ReadonlyArray<string> = GRUPOS.flatMap(([, ts]) => ts.map(([t]) => t))

export function classifyUserAgent(ua: string | undefined | null): UaClass {
  if (!ua || !ua.trim()) return { family: 'sin_ua', agent: '(vacío)' }
  const s = ua.toLowerCase()
  for (const [family, tokens] of GRUPOS) {
    for (const [token, agent] of tokens) {
      if (s.includes(token)) return { family, agent }
    }
  }
  return { family: 'navegador', agent: '' }
}
