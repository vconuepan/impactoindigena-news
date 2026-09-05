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
export const GEOGRAPHIC_ISSUE_SLUGS = ['chile-indigena', 'latinoamerica'] as const

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
   * Asia y el Pacifico. El grupo de la ONU, que incluye las islas del Pacifico
   * -Fiji, Papua Nueva Guinea, Salomon, Vanuatu, Samoa, Tonga, Kiribati- pero
   * NO a Australia ni a Nueva Zelandia, que alli figuran en WEOG y aqui tienen
   * seccion propia.
   */
  asiaPacifico: [
    'AF', 'SA', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'CY', 'AE', 'FJ', 'PH',
    'IN', 'ID', 'IR', 'IQ', 'MH', 'JP', 'JO', 'KZ', 'KI', 'KW', 'LA', 'LB',
    'MY', 'MV', 'FM', 'MN', 'MM', 'NR', 'NP', 'OM', 'PK', 'PW', 'PG', 'QA',
    'KR', 'KP', 'SB', 'WS', 'SG', 'LK', 'TJ', 'TH', 'TL', 'TO', 'TM', 'TV',
    'UZ', 'VN', 'YE', 'SY', 'PS', 'IL', 'TR', 'VU',
    // No son Estados miembros de la ONU y por eso no figuran en ningun grupo,
    // pero sus pueblos son parte de lo que cubrimos: los kanak de Kanaky /
    // Nueva Caledonia, los ma'ohi de la Polinesia francesa y los pueblos
    // aborigenes de Taiwan. Un territorio sin asiento en la Asamblea General
    // no es un territorio sin pueblo.
    'NC', 'PF', 'TW',
  ],

  /**
   * Australia y Aotearoa. Fuera del "y otros Estados" de la ONU.
   *
   * Aotearoa es el nombre maori de Nueva Zelandia. Son 69 historias de pueblos
   * aborigenes, isleños del Estrecho de Torres y maories: agruparlas con
   * Alemania y Suiza no las describe.
   */
  australiaAotearoa: ['AU', 'NZ'],

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
  'asia-pacifico': REGIONS.asiaPacifico,
  'australia-aotearoa': REGIONS.australiaAotearoa,
  sapmi: REGIONS.sapmi,
  'europa-occidental': REGIONS.europaOccidental,
  'europa-oriental': REGIONS.europaOriental,
}

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
  if (NOT_A_COUNTRY.has(folded)) return null

  const byName = BY_NAME[folded]
  if (byName) return byName

  // Ya viene como codigo ISO.
  const upper = value.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(upper) && Object.values(BY_NAME).includes(upper)) {
    return upper
  }

  return null
}
