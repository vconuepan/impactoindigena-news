/**
 * El orden de las ocho categorias tematicas, en un solo lugar.
 *
 * Lo usan la barra de navegacion y la portada, y antes cada una tenia su propia
 * lista. El 5-sep-2026 eso costo caro: se crearon cuatro categorias nuevas
 * -Territorio, Consulta, Defensores y Mujeres-, se agregaron a la barra, y la
 * portada siguio filtrando por su lista de cinco. Las cuatro nuevas, con 1.180
 * historias entre todas, no aparecian en la portada; y el esqueleto de carga
 * pintaba cinco secciones donde la pagina mostraba otras tantas, con el salto
 * de layout que eso implica.
 *
 * El orden va de la tierra a la gente, y es el mismo de DESIGN.md.
 */
// `readonly string[]` y no `as const`: la lista se compara contra slugs que
// llegan de la API como string, y un tipo literal obligaria a castear en cada
// llamada sin ganar nada.
export const ISSUE_ORDER: readonly string[] = [
  'territorio-y-tierras',
  'cambio-climatico',
  'consulta-y-consentimiento',
  'economias-indigenas',
  'derechos-indigenas',
  'defensores-y-proteccion',
  'mujeres-indigenas',
  'cultura-y-conocimientos-ancestrales',
]

/**
 * Las secciones geograficas NO van en la portada como temas: viven en la barra
 * de verticales, y una historia entra en ellas por su pais, no por su asunto.
 */
export const GEOGRAPHIC_SLUGS: readonly string[] = [
  'chile-indigena',
  'latinoamerica',
  'africa',
  'asia',
  'oceania',
  'sapmi',
  'europa-occidental',
  'europa-oriental',
]
