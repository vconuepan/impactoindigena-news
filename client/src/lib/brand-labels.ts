/** Etiquetas en castellano del criterio por marca (D5). Una sola fuente para la pantalla. */

export const CRITERIO_LABEL: Record<string, string> = {
  territorial: 'Criterio territorial',
  escala_mapuche: 'Escala Mapuche',
}

export const EJE_LABEL: Record<string, string> = {
  region_completa: 'Región completa',
  mapuche_chileno: 'Mapuche y chileno',
  regionalismo_centralismo: 'Regionalismo y centralismo',
  pobreza_desarrollo: 'Pobreza y desarrollo',
  seguridad: 'Seguridad',
  lengua: 'Lengua',
  saber: 'Saber',
  economia_propia: 'Economía propia',
  propuestas: 'Propuestas',
  protagonismo: 'Protagonismo',
  territorio_derechos: 'Territorio y derechos',
  conflicto: 'Conflicto',
  vida_urbana: 'Vida urbana',
  otro: 'Otro',
}

export const LUGAR_LABEL: Record<string, string> = {
  araucania: 'Araucanía',
  williche: 'Sur williche',
  gulumapu: 'Gulumapu',
  puelmapu: 'Puelmapu',
  otro: 'Otro',
}

export const ESTADO_MARCA_LABEL: Record<string, string> = {
  candidate: 'Candidata',
  evaluated: 'Juzgada',
  discarded: 'Descartada',
  selected: 'Elegida',
  published: 'Publicada',
}

export const ORIGEN_MARCA_LABEL: Record<string, string> = {
  territorial: 'Criterio territorial',
  rescate: 'Rescate',
  palabras_clave: 'Palabras clave',
}

export const BANDERA_MARCA_LABEL: Record<string, string> = {
  menores: 'menores',
  victimas: 'víctimas',
  violencia: 'violencia',
  proceso_penal: 'proceso penal',
  operativo: 'operativo',
}

/** Una bandera legible: las del juez tienen etiqueta; las del filtro son términos y van tal cual. */
export function banderaLabel(b: string): string {
  return BANDERA_MARCA_LABEL[b] ?? b
}
