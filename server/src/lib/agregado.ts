/**
 * El piso de un agregado que se publica: k ≥ 5.
 *
 * Regla permanente del proyecto (CLAUDE.md, «El origen étnico es dato
 * sensible»): para publicar datos indígenas se agrega, no se recorta, y el
 * agregado va con k ≥ 5 y sin cruzar dimensiones. Un conteo por debajo de
 * cinco identifica: «1 miembro» en la comunidad aymara dice de una persona
 * que se adscribió a un pueblo, y eso es el dato sensible que la Ley 19.628
 * (art. 10) y la 21.719 (art. 16) protegen.
 *
 * Medido el 18-oct-2026 y re-medido el 2-nov: `/api/communities/:slug`
 * publicaba `memberCount: 0` sin piso en las siete comunidades PUEBLO; con el
 * primero que se uniera, habría publicado 1.
 */
export const K_MINIMO = 5

/** El conteo si alcanza el piso; `null` si no, que en la página es «no se muestra». */
export function conPiso(conteo: number): number | null {
  return conteo >= K_MINIMO ? conteo : null
}
