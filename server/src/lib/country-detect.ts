/**
 * country-detect.ts
 *
 * Detecta el pais de una historia leyendo su titular y su resumen, sin LLM.
 *
 * POR QUE EXISTE. Pedirle el pais al modelo resulto fragil: devuelve vacio en
 * masa segun como se arme el prompt, el filtro de contenido de Azure rechaza
 * lotes enteros, y cada corrida cuesta llamadas. Pero el pais casi siempre esta
 * ESCRITO en el titular — "plantas medicinales en Ghana", "CONADI entrega
 * tierras", "SCJN protege agua de comunidades mayas". Reconocer un nombre en un
 * texto es una regla binaria, y en este repo las binarias van en el codigo:
 * misma leccion que `normalizeCountry` y el guardarrail de capitalizacion.
 *
 * QUE NO HACE. No adivina. Si el texto no nombra un pais, un gentilicio, una
 * ciudad o una institucion nacional, devuelve null y la historia se queda sin
 * pais — que es la respuesta correcta para una nota global o regional.
 *
 * PRECEDENCIA. Gana la señal mas especifica: una institucion nacional (CONADI
 * solo existe en Chile) pesa mas que un gentilicio, y un gentilicio mas que la
 * mencion suelta de una ciudad. Cuando dos paises distintos aparecen con la
 * misma fuerza, devuelve null: dos paises es tan malo como ninguno.
 */

/** Quita tildes y normaliza, igual que `country-focus.ts`. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Instituciones que solo existen en un pais. La señal mas fuerte. */
const INSTITUCIONES: Record<string, string> = {
  conadi: 'CL', conaf: 'CL', sernatur: 'CL', indap: 'CL', corfo: 'CL',
  'ministerio de desarrollo social': 'CL', 'tribunal ambiental': 'CL',
  inah: 'MX', scjn: 'MX', inpi: 'MX', inali: 'MX', 'inmaya': 'MX',
  funai: 'BR', 'ministerio dos povos indigenas': 'BR', ibama: 'BR',
  inai: 'AR', 'inpi argentina': 'AR',
  'onic': 'CO', 'anla': 'CO',
  'conaie': 'EC',
  'aidesep': 'PE', 'ministerio de cultura del peru': 'PE',
  'bureau of indian affairs': 'US', 'bia': 'US',
  'crown-indigenous relations': 'CA', 'assembly of first nations': 'CA',
  'niaa': 'AU', 'aiatsis': 'AU',
  'te puni kokiri': 'NZ', 'waitangi': 'NZ',
}

/** Gentilicios y adjetivos de pais. Fuertes, pero menos que una institucion. */
const GENTILICIOS: Record<string, string> = {
  chileno: 'CL', chilena: 'CL', chilenos: 'CL', chilenas: 'CL',
  mexicano: 'MX', mexicana: 'MX', mexicanos: 'MX', mexicanas: 'MX',
  brasileno: 'BR', brasilena: 'BR', brasileno_: 'BR', brasilenos: 'BR',
  argentino: 'AR', argentina_gent: 'AR', argentinos: 'AR',
  peruano: 'PE', peruana: 'PE', peruanos: 'PE',
  boliviano: 'BO', boliviana: 'BO', bolivianos: 'BO',
  colombiano: 'CO', colombiana: 'CO', colombianos: 'CO',
  ecuatoriano: 'EC', ecuatoriana: 'EC', ecuatorianos: 'EC',
  guatemalteco: 'GT', guatemalteca: 'GT',
  canadiense: 'CA', canadienses: 'CA',
  estadounidense: 'US', estadounidenses: 'US', norteamericano: 'US',
  australiano: 'AU', australiana: 'AU', australianos: 'AU',
  neozelandes: 'NZ', neozelandesa: 'NZ',
  paraguayo: 'PY', uruguayo: 'UY', venezolano: 'VE', panameno: 'PA',
  hondureno: 'HN', nicaraguense: 'NI', costarricense: 'CR', salvadoreno: 'SV',
  nepali: 'NP', indio: 'IN', hindu: 'IN', filipino: 'PH',
  indonesio: 'ID', keniano: 'KE', ghanes: 'GH', ghanesa: 'GH',
  sudafricano: 'ZA', noruego: 'NO', sueco: 'SE', finlandes: 'FI', ruso: 'RU',
}

/** Ciudades, regiones y territorios inequivocos de un pais. */
const LUGARES: Record<string, string> = {
  // Chile
  araucania: 'CL', 'la araucania': 'CL', temuco: 'CL', valdivia: 'CL',
  osorno: 'CL', antofagasta: 'CL', calama: 'CL', iquique: 'CL', arica: 'CL',
  copiapo: 'CL', vallenar: 'CL', 'san pedro de atacama': 'CL', 'rapa nui': 'CL',
  'isla de pascua': 'CL', 'puerto williams': 'CL', villarrica: 'CL',
  collipulli: 'CL', ercilla: 'CL', tirua: 'CL', canete: 'CL', lanco: 'CL',
  'nueva imperial': 'CL', carahue: 'CL', 'los rios': 'CL', 'los lagos': 'CL',
  biobio: 'CL', 'bio bio': 'CL', magallanes: 'CL', tarapaca: 'CL', huasco: 'CL',
  'padre las casas': 'CL', malleco: 'CL', cautin: 'CL', chiloe: 'CL',
  // Mexico
  // Sin "Guerrero", "Sonora" ni "Hidalgo": sustantivo, adjetivo y apellido
  // corrientes. "Guerrero indigena" aparece en decenas de titulares.
  oaxaca: 'MX', chiapas: 'MX', michoacan: 'MX', puebla: 'MX',
  chihuahua: 'MX', sinaloa: 'MX', yucatan: 'MX', tlaxcala: 'MX',
  'ciudad de mexico': 'MX', cdmx: 'MX', veracruz: 'MX', nayarit: 'MX',
  queretaro: 'MX', 'san luis potosi': 'MX', durango: 'MX',
  // Brasil
  //
  // NO van aca "Para" (el estado), "Acre" ni "Amazonas". Son palabras comunes
  // del español —una preposicion, un adjetivo, y un rio que ademas nombra
  // territorios en Colombia, Venezuela y Peru— y coincidian en cualquier texto:
  // medido sobre las 871 historias con pais conocido, "para" solo causaba la
  // mayoria de los 120 errores e inflaba Brasil a 641. Un toponimo que es
  // tambien palabra corriente no sirve como señal.
  'mato grosso': 'BR', roraima: 'BR', rondonia: 'BR', xingu: 'BR',
  'vale do javari': 'BR', 'sao paulo': 'BR', brasilia: 'BR',
  // Argentina — sin "Salta" ni "Formosa", que chocan con el verbo saltar y con
  // el adjetivo formosa.
  neuquen: 'AR', 'rio negro': 'AR', chubut: 'AR', jujuy: 'AR',
  misiones: 'AR', bariloche: 'AR', 'quila quina': 'AR',
  // Otros
  ladakh: 'IN', jharkhand: 'IN', rajasthan: 'IN', 'andhra pradesh': 'IN',
  guajira: 'CO', 'la guajira': 'CO', cauca: 'CO', vaupes: 'CO',
  alberta: 'CA', saskatchewan: 'CA', manitoba: 'CA', 'british columbia': 'CA',
  'columbia britanica': 'CA', ontario: 'CA', quebec: 'CA', nunavut: 'CA',
  alaska: 'US', arizona: 'US', dakota: 'US',
  oklahoma: 'US', minnesota: 'US', 'dakota del sur': 'US', montana: 'US',
  bougainville: 'PG', mindanao: 'PH', sarawak: 'MY', papua: 'ID',
  purace: 'CO', 'tierra del fuego': 'AR',
}

export type DeteccionPais = {
  pais: string | null
  /** Que lo decidio, para poder auditar una corrida sin volver a correrla. */
  senal: 'institucion' | 'gentilicio' | 'lugar' | 'nombre' | 'ambiguo' | 'ninguna'
  termino?: string
}

/**
 * Busca el termino como palabra completa, no como fragmento.
 *
 * Sin esto "para" (estado de Brasil) coincidiria dentro de "preparar" y "acre"
 * dentro de "masacre". El limite se hace a mano y no con \b porque el texto
 * viene plegado y \b no trata bien los limites con caracteres no ASCII.
 */
function contienePalabra(texto: string, termino: string): boolean {
  const i = texto.indexOf(termino)
  if (i === -1) return false
  const antes = i === 0 ? ' ' : texto[i - 1]
  const despues = i + termino.length >= texto.length ? ' ' : texto[i + termino.length]
  return !/[a-z0-9]/.test(antes) && !/[a-z0-9]/.test(despues)
}

/**
 * Detecta el pais de una historia. `nombresDePais` es el mapa de
 * `country-focus.ts`, que se pasa como parametro para no duplicarlo.
 */
/**
 * Nombres que hay que resolver JUNTO con los nombres de pais, en la misma capa,
 * porque contienen a uno de ellos y tienen que poder desplazarlo.
 */
const CONTIENEN_UN_PAIS: Record<string, string> = {
  'nuevo mexico': 'US', 'nueva zelanda': 'NZ', 'guinea ecuatorial': 'GQ',
  'papua nueva guinea': 'PG', 'guinea bissau': 'GW', 'sudan del sur': 'SS',
  'timor oriental': 'TL', 'corea del sur': 'KR', 'corea del norte': 'KP',
  'republica dominicana': 'DO', 'costa de marfil': 'CI',
}

export function detectarPais(
  texto: string,
  nombresDePais: Record<string, string>,
): DeteccionPais {
  const t = fold(texto)

  // De la señal mas especifica a la mas debil. La primera capa que resuelve
  // SIN ambiguedad decide; si una capa da dos paises distintos, se corta ahi y
  // no se baja a una capa mas debil: la ambiguedad es informacion, no ruido.
  const capas: [DeteccionPais['senal'], Record<string, string>][] = [
    ['institucion', INSTITUCIONES],
    ['gentilicio', GENTILICIOS],
    ['nombre', { ...nombresDePais, ...CONTIENEN_UN_PAIS }],
    ['lugar', LUGARES],
  ]

  for (const [senal, mapa] of capas) {
    const encontrados = new Map<string, string>()
    for (const [termino, iso] of Object.entries(mapa)) {
      // Las claves con sufijo `_` existen para desambiguar homonimos en el
      // mapa (argentina el pais vs argentina el gentilicio); no se buscan.
      if (termino.includes('_')) continue
      if (contienePalabra(t, termino)) encontrados.set(iso, termino)
    }
    // Un termino que CONTIENE a otro lo desplaza: "nuevo mexico" gana sobre
    // "mexico", "rio negro" sobre "negro". Sin esto, "Nuevo Mexico promueve
    // energia geotermica" se marcaba como Mexico en vez de Estados Unidos.
    // Solo aplica a terminos anidados: dos nombres independientes en el mismo
    // texto —Noruega y Rapa Nui— siguen siendo ambiguos, que es lo correcto.
    const terminos = [...encontrados.values()]
    for (const [iso, termino] of [...encontrados.entries()]) {
      if (terminos.some(otro => otro !== termino && otro.includes(termino))) {
        encontrados.delete(iso)
      }
    }

    if (encontrados.size === 1) {
      const [iso, termino] = [...encontrados.entries()][0]
      return { pais: iso, senal, termino }
    }
    if (encontrados.size > 1) return { pais: null, senal: 'ambiguo' }
  }

  return { pais: null, senal: 'ninguna' }
}
