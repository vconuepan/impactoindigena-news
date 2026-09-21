/**
 * Comportamiento de desplazamiento que respeta `prefers-reduced-motion`.
 *
 * El CSS del proyecto ya honra esa preferencia, pero un `scrollTo` o un
 * `scrollIntoView` con `behavior: 'smooth'` la ATRAVIESA: el desplazamiento
 * animado lo decide el argumento de JavaScript, no la hoja de estilos. Habia
 * tres llamadas asi, y para alguien con sensibilidad vestibular un salto de
 * pagina animado es exactamente lo que esa preferencia pide evitar.
 */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || !window.matchMedia) return 'smooth'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
