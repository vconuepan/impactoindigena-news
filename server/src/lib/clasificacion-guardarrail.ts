/**
 * Guardarrail determinista sobre el tema que asigna el clasificador.
 *
 * POR QUE EXISTE. Las reglas de corte de `CLASSIFICATION_BLOCK` son
 * instrucciones al modelo, y una instruccion al modelo es una restriccion
 * BLANDA: se cumple casi siempre y falla algunas veces, sin avisar. Medido en
 * este proyecto, reforzar una regla en el prompt tuvo efecto CERO sobre la tasa
 * de fallo. La doctrina del repo es que lo verificable va en codigo.
 *
 * QUE HACE Y QUE NO. No corrige: MARCA. Elegir el tema correcto es un juicio
 * sobre el asunto central, y un puñado de palabras no puede hacerlo. Lo que si
 * puede hacer una lista de terminos es detectar la CONTRADICCION EVIDENTE —una
 * historia sobre una licitacion archivada en cultura— y dejar constancia.
 *
 * Cada regla de aqui corresponde a una regla de corte numerada del prompt, y
 * solo se implementan las que son binarias por presencia de terminos. Las que
 * dependen de una ausencia ("defensores exige una persona en riesgo") no estan:
 * no encontrar la palabra no prueba que el hecho no este.
 *
 * SOLO EL TITULAR. Se probo primero contra el titular mas 1.500 caracteres del
 * cuerpo y salieron 22 casos, la mayoria falsos: "in memoriam" en el pie de
 * pagina de Cultural Survival, "hospital" mencionado al pasar en una nota sobre
 * una marcha, "inversion" como el monto de un centro ceremonial. En el cuerpo
 * un termino aparece por contexto; en el titular aparece porque es el asunto.
 * Es la misma leccion que el detector de pais: mas contexto empeoro el
 * resultado.
 */

export interface Sospecha {
  /** Numero de la regla de corte de CLASSIFICATION_BLOCK que se contradice. */
  regla: number
  /** Que se detecto, en una linea, para que el registro sea legible. */
  motivo: string
  /** El termino concreto que la disparo, para poder juzgar el falso positivo. */
  termino: string
  /** Donde deberia estar, segun esa regla. */
  sugerido: string
}

/** Sin tildes y en minusculas, para comparar sin depender de como venga escrito. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Busca un termino como PALABRA COMPLETA.
 *
 * Con `includes` a secas, "banca" aparece dentro de "bancada" y "mina" dentro
 * de "caminata": el guardarrail se llenaria de falsos positivos y nadie lo
 * miraria. El limite `\b` de una expresion regular no sirve con acentos, asi
 * que se compara sobre el texto ya sin tildes.
 */
function contiene(texto: string, termino: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${termino}($|[^a-z0-9])`, 'i').test(texto)
}

/**
 * Cuando alguna de estas aparece en el titular, la regla 8 no aplica: una
 * muerte violenta o bajo custodia del Estado no es una nota protocolar, es
 * exactamente lo que Defensores cubre. Sin esto, el guardarrail marcaba
 * "Fallecimiento de lider misquito bajo custodia en Nicaragua".
 */
const MUERTE_NO_PROTOCOLAR = [
  'custodia', 'asesinado', 'asesinada', 'asesinato', 'baleado', 'baleada',
  'crimen', 'homicidio', 'masacre', 'atentado', 'emboscada', 'desaparicion',
  'desaparecido', 'desaparecida', 'violencia',
]

interface Regla {
  regla: number
  /** Temas en los que esta regla se considera contradicha. */
  cuandoEsta: string[]
  sugerido: string
  motivo: string
  terminos: string[]
}

const REGLAS: Regla[] = [
  {
    regla: 2,
    cuandoEsta: ['cultura-y-conocimientos-ancestrales'],
    sugerido: 'economias-indigenas',
    motivo: 'habla de negocio, no de obra ni de saber',
    terminos: [
      'licitacion', 'licitaciones', 'banca', 'bancario', 'credito', 'creditos',
      'prestamo', 'facturacion', 'exportacion', 'exportaciones', 'proveedor',
      'proveedores', 'cadena de suministro', 'compras publicas',
      'financiamiento', 'emprendimiento', 'cooperativa', 'facturo',
      // "inversion" quedo fuera a proposito: describe el monto de cualquier
      // obra publica, incluida la cultural. Marcaba "Lota inaugura centro
      // ceremonial mapuche con inversion de 269 millones", que es cultura.
    ],
  },
  {
    regla: 3,
    cuandoEsta: ['cultura-y-conocimientos-ancestrales'],
    sugerido: 'derechos-indigenas',
    motivo: 'es un servicio del Estado, no conocimiento ancestral',
    terminos: [
      'hospital', 'vacunacion', 'vacunas', 'centro de salud', 'consultorio',
      'alcantarillado', 'agua potable', 'carretera', 'pavimentacion',
      'vivienda', 'viviendas', 'subsidio habitacional',
    ],
  },
  {
    regla: 8,
    cuandoEsta: ['defensores-y-proteccion', 'cultura-y-conocimientos-ancestrales'],
    sugerido: 'derechos-indigenas',
    motivo: 'es una nota protocolar, sin agresion ni obra',
    terminos: [
      'condolencias', 'pesame', 'obituario', 'fallecimiento', 'funeral',
      'in memoriam', 'aniversario institucional',
    ],
  },
  {
    regla: 9,
    cuandoEsta: ['cultura-y-conocimientos-ancestrales'],
    sugerido: 'territorio-y-tierras',
    motivo: 'los derechos de la naturaleza son tierra y agua por via juridica',
    terminos: [
      'derechos de la naturaleza', 'sujeto de derecho', 'personalidad juridica del rio',
      'rights of nature',
    ],
  },
]

/**
 * Devuelve las contradicciones evidentes entre el texto y el tema asignado.
 * Vacio cuando no hay ninguna, que es el caso normal.
 */
export function detectarClasificacionSospechosa(
  texto: string,
  slugAsignado: string | null | undefined,
): Sospecha[] {
  if (!slugAsignado || !texto) return []
  const t = fold(texto)
  const salida: Sospecha[] = []

  const muerteViolenta = MUERTE_NO_PROTOCOLAR.some((m) => contiene(t, fold(m)))

  for (const r of REGLAS) {
    if (!r.cuandoEsta.includes(slugAsignado)) continue
    if (r.regla === 8 && muerteViolenta) continue
    for (const termino of r.terminos) {
      if (!contiene(t, fold(termino))) continue
      salida.push({ regla: r.regla, motivo: r.motivo, termino, sugerido: r.sugerido })
      break // una por regla: el objetivo es señalar, no inventariar
    }
  }

  return salida
}
