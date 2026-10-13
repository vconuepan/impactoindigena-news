/**
 * Los orígenes que una marca publica y muestra (D5): solo los de un carril en
 * modo aplicar. Araucanía publica lo territorial (término y feed) con su modo;
 * Voces Mapuche publica solo el rescate, con el modo del rescate: lo de palabras
 * clave ya está publicado y su modo ordena las destacadas, no publica.
 *
 * Una sola regla para el carril que publica (services/brandLane.ts) y para la
 * vitrina que muestra (services/brandShowcase.ts): pasar un carril a sombra lo
 * saca de la vitrina al instante, aunque la marca siga con otro carril en
 * aplicar (diseño, 9.5; revisión del 13-oct). Pura.
 */
export function origenesQuePublican(c: { criterion: string; mode: string; rescueMode: string }): string[] {
  if (c.criterion === 'territorial') return c.mode === 'enforce' ? ['term', 'feed'] : []
  return c.rescueMode === 'enforce' ? ['rescue'] : []
}
