/**
 * Normalizacion del pais que devuelve el clasificador.
 *
 * El modelo responde con el nombre en español ("Chile", "Brasil"); esto lo
 * lleva a ISO 3166-1 alfa-2, que es lo que guarda `Story.countryFocus`.
 *
 * POR QUE NO SE LE PIDE EL CODIGO AL MODELO: es exactamente el caso de la
 * leccion del 15-ago-2026 con la capitalizacion de titulos. Escribir "Chile"
 * es algo que un LLM hace bien; mapear a "CL" sin equivocarse nunca es una
 * regla binaria, y una regla binaria va en el codigo. Ver
 * `lib/title-capitalization.ts` y `.context/llm-analysis.md`.
 *
 * Lo que no reconoce devuelve null, y null significa "sin pais", que es un
 * valor legitimo: la mayoria de los articulos son regionales o globales.
 * Prefiere no marcar antes que marcar mal — una historia sin marca simplemente
 * no aparece en la seccion de su pais, mientras que una marca equivocada la
 * pone en la seccion de otro.
 */

/**
 * Temas que agrupan por geografia, no por asunto.
 *
 * "Chile Intercultural" es una seccion del sitio como cualquier otra, pero su
 * criterio es el pais. Mezclar los dos ejes hacia que una noticia chilena de
 * derechos terminara solo en Chile y desapareciera de Derechos Indigenas: al
 * 15-ago-2026 habia 94 historias chilenas repartidas en las otras tres
 * secciones y ausentes de la suya.
 *
 * El clasificador NO recibe estos temas como opcion. Ofrecerselos mientras se
 * le pide clasificar por asunto central seria una contradiccion, y los modelos
 * gastan razonamiento tratando de reconciliarlas (`.context/prompting.md`).
 */
// GEOGRAPHIC_ISSUE_SLUGS se declara mas abajo, derivada de
// GEOGRAPHIC_ISSUE_COUNTRIES, que es la fuente de que secciones son geograficas.

/**
 * Regiones, como listas de paises en ISO 3166-1 alfa-2.
 *
 * Existen porque una seccion geografica puede agrupar mas de un pais y
 * `Story.countryFocus` guarda uno solo. La barra de verticales del sitio hace
 * un zoom de escala —Wallmapu, Chile, Latinoamerica, Mundo— y los dos extremos
 * no son paises: Wallmapu se resuelve por comunidad y Mundo es la portada, sin
 * filtro. Latinoamerica si es una lista, y va aca.
 *
 * La lista es codigo y no prompt a proposito: que Guatemala pertenezca a
 * Latinoamerica es una regla binaria, y las binarias van en el codigo. Misma
 * leccion que `normalizeCountry` y el guardarrail de capitalizacion.
 */
/**
 * Las regiones que alimentan las secciones geograficas.
 *
 * Los nombres siguen a los grupos regionales de la ONU donde describen bien lo
 * que contienen -Africa, Asia y el Pacifico, Europa Oriental- y se apartan de
 * ellos donde no. Los grupos de la ONU reparten asientos en la Asamblea
 * General: agrupan Estados por conveniencia diplomatica, no pueblos por
 * territorio, y por eso Australia figura junto a Alemania y Canada junto a
 * Monaco.
 *
 * Medido el 5-sep-2026 sobre las 2.850 historias publicadas con pais: adoptar
 * los cinco grupos tal cual dejaba 711 historias de pueblos indigenas -inuit,
 * Primeras Naciones, nativos de Estados Unidos, aborigenes australianos,
 * maories y sami- dentro de una seccion llamada "Europa Occidental y otros
 * Estados", que ademas habria sido la segunda del sitio. De ahi las tres
 * salidas de la nomenclatura: Abya Yala no se parte, y Australia y Aotearoa y
 * Sapmi salen del "otros".
 */
export const REGIONS = {
  /**
   * Abya Yala: el continente americano completo.
   *
   * El nombre es guna y designa America entera, no solo su mitad de habla
   * hispana y portuguesa, asi que la seccion incluye a Canada y Estados
   * Unidos. Recortarla a America Latina dejaria fuera a las Primeras Naciones,
   * los inuit, los metis y los pueblos nativos de Estados Unidos, que este
   * medio cubre: el nombre prometeria mas de lo que entrega. Es tambien la
   * razon por la que no se usa el grupo GRULAC de la ONU, que corta el
   * continente a la altura del rio Bravo.
   */
  abyaYala: [
    // America del Norte
    'CA', 'US', 'MX',
    // Centroamerica
    'GT', 'BZ', 'SV', 'HN', 'NI', 'CR', 'PA',
    // Sudamerica
    'CO', 'VE', 'EC', 'PE', 'BO', 'CL', 'AR', 'PY', 'UY', 'BR', 'GY', 'SR',
    // Caribe
    'CU', 'DO', 'HT', 'PR',
    // Groenlandia: kalaallit, un pueblo inuit. Es America aunque el Estado sea danes.
    'GL',
  ],

  /** Africa. El grupo de la ONU sin cambios: describe lo que contiene. */
  africa: [
    'AO', 'DZ', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'TD', 'KM', 'CG', 'CI',
    'DJ', 'EG', 'ER', 'ET', 'SZ', 'GA', 'GM', 'GH', 'GN', 'GW', 'GQ', 'KE',
    'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MA', 'MR', 'MU', 'MZ', 'NE', 'NG',
    'NA', 'CF', 'CD', 'TZ', 'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SD',
    'SS', 'TG', 'TN', 'UG', 'ZW', 'ZM', 'EH',
  ],

  /**
   * Asia.
   *
   * Es el grupo "Asia y el Pacifico" de la ONU al que se le quitaron las islas
   * del Pacifico, que estan en `oceania`. Sin ellas el nombre corto es el
   * exacto: llamarla "Asia y el Pacifico" sin Australia habria prometido un
   * Pacifico que la seccion no contiene, que es el mismo defecto por el que se
   * descarto WEOG.
   */
  asia: [
    'AF', 'SA', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'CY', 'AE', 'PH', 'IN',
    'ID', 'IR', 'IQ', 'JP', 'JO', 'KZ', 'KW', 'LA', 'LB', 'MY', 'MV', 'MN',
    'MM', 'NP', 'OM', 'PK', 'QA', 'KR', 'KP', 'SG', 'LK', 'TJ', 'TH', 'TL',
    'TM', 'UZ', 'VN', 'YE', 'SY', 'PS', 'IL', 'TR', 'KG', 'TW',
  ],

  /**
   * Oceania entera: Australia, Aotearoa y las islas del Pacifico.
   *
   * Los grupos de la ONU la parten -las islas van en "Asia y el Pacifico" y
   * Australia y Nueva Zelandia en WEOG-, y esa division no describe nada de lo
   * que aqui se cubre. Papua Nueva Guinea, Fiji y Kanaky comparten con
   * Australia y Aotearoa la pregunta del Pacifico: descolonizacion pendiente,
   * alza del mar y mineria en aguas profundas. No la comparten con Nepal.
   *
   * Aotearoa es el nombre maori de Nueva Zelandia. Kanaky lo es de Nueva
   * Caledonia; ni ella ni la Polinesia francesa son Estados miembros de la ONU,
   * y por eso no figuran en ningun grupo.
   */
  oceania: [
    'AU', 'NZ',
    'PG', 'FJ', 'SB', 'VU', 'NC',
    'WS', 'TO', 'TV', 'KI', 'NR', 'PW', 'FM', 'MH', 'PF',
  ],

  /**
   * Sapmi: el territorio sami, que cruza cuatro Estados sin coincidir con
   * ninguno. Mismo criterio que Wallmapu: se nombra el territorio del pueblo,
   * no la casilla del Estado que lo administra.
   *
   * La peninsula de Kola es rusa y Rusia esta ademas en Europa Oriental: una
   * historia sami de Murmansk aparece en las dos, que es exactamente lo que
   * permite el eje geografico.
   */
  sapmi: ['NO', 'SE', 'FI'],

  /**
   * Europa Occidental: el grupo WEOG de la ONU al que se le quitaron America
   * -que es Abya Yala- y Oceania -que es Australia y Aotearoa-, tal como
   * quedaba al separar esas dos. Lo que queda es Europa occidental y nada mas,
   * y por eso el "y otros Estados" del nombre original sobra aqui.
   *
   * Noruega, Suecia y Finlandia estan tambien en Sapmi: una historia sami
   * aparece en las dos, que es lo que permite el eje geografico.
   */
  europaOccidental: [
    'DE', 'AD', 'AT', 'BE', 'DK', 'ES', 'FI', 'FR', 'GR', 'IS', 'IE', 'IT',
    'LI', 'LU', 'MT', 'MC', 'NO', 'NL', 'PT', 'GB', 'SM', 'SE', 'CH',
  ],

  /** Europa Oriental. El grupo de la ONU sin cambios. */
  europaOriental: [
    'AL', 'AM', 'SK', 'ME', 'MK', 'AZ', 'BY', 'BA', 'BG', 'HR', 'CZ', 'EE',
    'GE', 'HU', 'LV', 'LT', 'MD', 'PL', 'RO', 'RU', 'RS', 'SI', 'UA',
  ],
} as const satisfies Record<string, readonly string[]>

/**
 * Paises que alimentan cada seccion geografica.
 *
 * Antes era un pais por seccion (`Record<string, string>`), lo que alcanzaba
 * cuando la unica seccion geografica era Chile. Con Latinoamerica hace falta
 * una lista, y `buildIssueCondition` filtra con `countryFocus IN (...)`.
 */
export const GEOGRAPHIC_ISSUE_COUNTRIES: Record<string, readonly string[]> = {
  'chile-indigena': ['CL'],
  // El slug se conserva de cuando la seccion se llamaba Latinoamerica: no vale
  // romper los enlaces que ya existen por un renombre.
  latinoamerica: REGIONS.abyaYala,
  africa: REGIONS.africa,
  asia: REGIONS.asia,
  oceania: REGIONS.oceania,
  sapmi: REGIONS.sapmi,
  'europa-occidental': REGIONS.europaOccidental,
  'europa-oriental': REGIONS.europaOriental,
}

/**
 * Las secciones geograficas, derivadas del mapa de arriba.
 *
 * Se deriva y no se escribe a mano porque escrita a mano se desincronizo: el
 * 5-sep-2026 se crearon seis secciones nuevas -Africa, Asia, Oceania, Sapmi y
 * las dos Europas- y esta lista se quedo con las dos viejas. El clasificador
 * las vio como temas de asunto y alcanzo a archivar diez historias en ellas
 * antes de que se notara. Una lista que enumera lo mismo que otra es una lista
 * que se desincroniza.
 */
export const GEOGRAPHIC_ISSUE_SLUGS = Object.keys(
  GEOGRAPHIC_ISSUE_COUNTRIES,
) as readonly string[]

/**
 * Compatibilidad: el primer pais de la seccion.
 *
 * Se conserva porque el codigo viejo esperaba un solo valor. Para filtrar,
 * usar `GEOGRAPHIC_ISSUE_COUNTRIES`, que es la fuente completa.
 */
export const GEOGRAPHIC_ISSUE_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(GEOGRAPHIC_ISSUE_COUNTRIES).map(([slug, paises]) => [slug, paises[0]]),
)

/**
 * Nombre en español (normalizado, sin tildes ni mayusculas) → ISO 3166-1 alfa-2.
 *
 * Se exporta para que `country-detect.ts` reconozca los mismos nombres sin
 * mantener una segunda copia. Una tabla de paises escrita dos veces es una
 * tabla que se desincroniza.
 */
export const BY_NAME: Record<string, string> = {
  chile: 'CL',
  argentina: 'AR',
  bolivia: 'BO',
  brasil: 'BR',
  brazil: 'BR',
  canada: 'CA',
  colombia: 'CO',
  'costa rica': 'CR',
  ecuador: 'EC',
  'el salvador': 'SV',
  guatemala: 'GT',
  guyana: 'GY',
  honduras: 'HN',
  mexico: 'MX',
  nicaragua: 'NI',
  panama: 'PA',
  paraguay: 'PY',
  peru: 'PE',
  surinam: 'SR',
  uruguay: 'UY',
  venezuela: 'VE',
  'estados unidos': 'US',
  'united states': 'US',
  eeuu: 'US',
  'nueva zelanda': 'NZ',
  australia: 'AU',
  noruega: 'NO',
  suecia: 'SE',
  finlandia: 'FI',
  rusia: 'RU',
  india: 'IN',
  nepal: 'NP',
  indonesia: 'ID',
  filipinas: 'PH',
  malasia: 'MY',
  camboya: 'KH',
  bangladesh: 'BD',
  tailandia: 'TH',
  vietnam: 'VN',
  japon: 'JP',
  taiwan: 'TW',
  kenia: 'KE',
  tanzania: 'TZ',
  namibia: 'NA',
  nigeria: 'NG',
  camerun: 'CM',
  congo: 'CD',
  sudafrica: 'ZA',
  mozambique: 'MZ',
  etiopia: 'ET',
  groenlandia: 'GL',

  // --- Ampliacion del 3-sep-2026 ---
  //
  // El mapa original cubria America Latina y una docena de paises con pueblos
  // indigenas conocidos. El corpus resulto ser mas ancho: al correr el backfill
  // de pais sobre las 2.309 historias sin marcar, el modelo devolvio "China",
  // "Myanmar" y "Papua Nueva Guinea" y las tres se descartaron por no estar
  // aqui. Un pais que el modelo identifica bien y el codigo tira a la basura es
  // una historia que no aparece en su seccion.
  //
  // Africa
  ghana: 'GH', botsuana: 'BW', botswana: 'BW', uganda: 'UG', ruanda: 'RW',
  zimbabue: 'ZW', zambia: 'ZM', malaui: 'MW', malawi: 'MW', angola: 'AO',
  senegal: 'SN', mali: 'ML', 'burkina faso': 'BF', niger: 'NE', chad: 'TD',
  somalia: 'SO', eritrea: 'ER', sudan: 'SD', 'sudan del sur': 'SS',
  marruecos: 'MA', argelia: 'DZ', tunez: 'TN', libia: 'LY', egipto: 'EG',
  gabon: 'GA', benin: 'BJ', togo: 'TG', 'costa de marfil': 'CI',
  guinea: 'GN', 'sierra leona': 'SL', liberia: 'LR', mauritania: 'MR',
  madagascar: 'MG', 'republica centroafricana': 'CF', burundi: 'BI',
  'republica democratica del congo': 'CD',
  // Agregados el 5-sep-2026 al cerrar el mapa geografico: son paises de las
  // regiones nuevas que el mapa no tenia, asi que el modelo no podia
  // devolverlos por nombre y sus historias no habrian entrado en ninguna
  // seccion.
  // "congo" a secas ya estaba resuelto arriba como CD, la Republica
  // Democratica, que es la que este medio cubre. Aqui solo se agrega la
  // Republica del Congo con su nombre largo, para no pisar esa decision.
  'cabo verde': 'CV', comoras: 'KM', 'republica del congo': 'CG',
  yibuti: 'DJ', djibouti: 'DJ', esuatini: 'SZ', suazilandia: 'SZ',
  gambia: 'GM', 'guinea-bisau': 'GW', 'guinea bissau': 'GW',
  'guinea ecuatorial': 'GQ', lesoto: 'LS', lesotho: 'LS', mauricio: 'MU',
  'santo tome y principe': 'ST', seychelles: 'SC', 'sahara occidental': 'EH',
  // Asia
  barein: 'BH', bahrein: 'BH', chipre: 'CY', 'emiratos arabes unidos': 'AE',
  kuwait: 'KW', maldivas: 'MV', oman: 'OM', catar: 'QA', qatar: 'QA',
  // Europa occidental
  andorra: 'AD', liechtenstein: 'LI', luxemburgo: 'LU', malta: 'MT',
  monaco: 'MC', 'san marino': 'SM',
  // Europa oriental
  albania: 'AL', eslovaquia: 'SK', montenegro: 'ME', 'macedonia del norte': 'MK',
  bielorrusia: 'BY', 'bosnia y herzegovina': 'BA', bosnia: 'BA', bulgaria: 'BG',
  croacia: 'HR', chequia: 'CZ', 'republica checa': 'CZ', hungria: 'HU',
  moldavia: 'MD', serbia: 'RS', eslovenia: 'SI',

  // Asia
  china: 'CN', myanmar: 'MM', birmania: 'MM', laos: 'LA', 'sri lanka': 'LK',
  pakistan: 'PK', butan: 'BT', bhutan: 'BT', mongolia: 'MN',
  'corea del sur': 'KR', 'corea del norte': 'KP', israel: 'IL',
  palestina: 'PS', iran: 'IR', irak: 'IQ', turquia: 'TR', siria: 'SY',
  libano: 'LB', jordania: 'JO', 'arabia saudita': 'SA', yemen: 'YE',
  afganistan: 'AF', kazajistan: 'KZ', uzbekistan: 'UZ', kirguistan: 'KG',
  tayikistan: 'TJ', turkmenistan: 'TM', azerbaiyan: 'AZ', armenia: 'AM',
  georgia: 'GE', 'timor oriental': 'TL', brunei: 'BN', singapur: 'SG',

  // Oceania
  'papua nueva guinea': 'PG', fiyi: 'FJ', fiji: 'FJ', vanuatu: 'VU',
  'islas salomon': 'SB', samoa: 'WS', tonga: 'TO', palaos: 'PW',
  kiribati: 'KI', tuvalu: 'TV', nauru: 'NR', micronesia: 'FM',
  'islas marshall': 'MH', 'nueva caledonia': 'NC', 'polinesia francesa': 'PF',

  // Europa
  espana: 'ES', portugal: 'PT', francia: 'FR', 'reino unido': 'GB',
  irlanda: 'IE', alemania: 'DE', italia: 'IT', 'paises bajos': 'NL',
  belgica: 'BE', suiza: 'CH', austria: 'AT', dinamarca: 'DK',
  islandia: 'IS', polonia: 'PL', ucrania: 'UA', grecia: 'GR', rumania: 'RO',
  estonia: 'EE', letonia: 'LV', lituania: 'LT',

  // America y Caribe
  belice: 'BZ', cuba: 'CU', 'republica dominicana': 'DO', haiti: 'HT',
  jamaica: 'JM', 'trinidad y tobago': 'TT', 'puerto rico': 'PR',
  bahamas: 'BS', barbados: 'BB', dominica: 'DM', 'santa lucia': 'LC',
  granada: 'GD', 'san vicente y las granadinas': 'VC',
}

/**
 * Valores que el modelo devuelve para decir "ninguno" y que NO son paises.
 * Sin esto, "global" o "varios" entrarian como texto libre a la columna.
 */
const NOT_A_COUNTRY = new Set([
  '', 'ninguno', 'ninguna', 'n/a', 'na', 'global', 'mundial', 'internacional',
  'regional', 'varios', 'multiple', 'multiples', 'america latina', 'latinoamerica',
  'amazonia', 'africa', 'asia', 'europa', 'oceania', 'america', 'desconocido',
  // Agregados el 3-sep-2026, vistos en las respuestas reales del modelo.
  'pacifico', 'islas del pacifico', 'artico', 'africa oriental',
  'africa subsahariana', 'sudamerica', 'america del sur', 'centroamerica',
  'america central', 'america del norte', 'norteamerica', 'mesoamerica',
  'sudeste asiatico', 'medio oriente', 'caribe', 'escandinavia', 'sapmi',
  'union europea', 'abya yala', 'wallmapu',
])

/** Quita tildes y normaliza para comparar sin depender de como venga escrito. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas diacriticas
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Devuelve el codigo ISO 3166-1 alfa-2 del pais, o null si no se reconoce.
 *
 * Acepta tambien un codigo ya normalizado ("CL"), asi que es idempotente: se
 * puede aplicar dos veces sin cambiar el resultado.
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null

  const folded = fold(value)

  // Namibia antes que "no aplica". Su codigo ISO es NA, que es tambien la
  // abreviatura que el modelo usa para decir que no hay pais, y como
  // NOT_A_COUNTRY se consultaba primero, "NA" en mayusculas -escrito asi solo
  // por el codigo, nunca por el modelo- se descartaba y las historias de
  // Namibia se quedaban sin seccion. Un valor que llega EXACTAMENTE como codigo
  // ISO en mayusculas es un codigo, no una abreviatura: eso lo desambigua sin
  // tocar el caso real, porque el modelo escribe "n/a" o "na", no "NA".
  const asCode = value.trim()
  if (/^[A-Z]{2}$/.test(asCode) && Object.values(BY_NAME).includes(asCode)) {
    return asCode
  }

  if (NOT_A_COUNTRY.has(folded)) return null

  const byName = BY_NAME[folded]
  if (byName) return byName

  const upper = asCode.toUpperCase()
  if (/^[A-Z]{2}$/.test(upper) && Object.values(BY_NAME).includes(upper)) {
    return upper
  }

  return null
}
