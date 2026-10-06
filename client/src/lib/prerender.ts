/**
 * ¿Esta pagina se esta PRERENDERIZANDO (Puppeteer, en el build) o la ve un lector?
 *
 * `@prerenderer/renderer-puppeteer` define `window.__PRERENDER_INJECTED` antes
 * de que corra cualquier script, con lo que `vite.config.ts` le pase en
 * `rendererOptions.inject`. En un navegador real no existe.
 *
 * EL DEFECTO QUE ESTO CORRIGE (6-oct-2026): el hero de la portada declara
 * `srcset` con las variantes de 800 y 1200 px y, si la variante responde 404,
 * quita el `srcset` y carga el original. El build de CI corrio ANTES de que
 * las variantes existieran en R2: en Puppeteer la variante dio 404, el
 * respaldo se activo y el prerender serializo el DOM en ese estado. El HTML
 * de produccion salio con el hero SIN `srcset`, asi que cada visita bajaba el
 * original (318 KB) por el HTML y ademas la variante (65 KB) por React.
 * PageSpeed lo mostro como dos filas del mismo elemento.
 *
 * Un fallo de carga durante el prerender no es informacion sobre el lector:
 * describe el bucket en el minuto del build. Por eso los respaldos por error
 * de imagen se saltan cuando esto devuelve true y el HTML horneado conserva
 * siempre el `srcset`; el navegador del lector decide con su propia red.
 */
export function estaPrerenderizando(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { __PRERENDER_INJECTED?: unknown }).__PRERENDER_INJECTED)
}
