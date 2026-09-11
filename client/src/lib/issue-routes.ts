/**
 * Las rutas de seccion que hay que prerenderizar, derivadas de lo que
 * `/api/issues` ya devuelve.
 *
 * POR QUE EXISTE ESTE MODULO
 *
 * Hasta el 10-sep-2026 `vite.config.ts` hacia `issues.map(i => i.slug)` sobre
 * ese endpoint. Pero `getPublicIssues()` filtra `parentId: null` y trae las
 * subsecciones ANIDADAS en `children`, asi que ese `map` se quedaba con las 16
 * madres y **tiraba las 18 subsecciones**.
 *
 * El sitemap, en cambio, las saca de `prisma.issue.findMany()` sin filtro: las
 * declaraba todas. Resultado medido en vivo: **18 de 18 subsecciones devolvian
 * la portada byte a byte** —mismo md5— con 1.764 historias detras. Soft 404, y
 * de los que no se toleran: DECLARADOS a Google en el sitemap. Este proyecto ya
 * pago 229 Soft 404 en Search Console por esta misma clase de defecto.
 *
 * Es la tercera vez que las dos listas divergen. Las dos primeras fueron entre
 * listas estaticas y las ato `sitemap-sincronia.test.ts`; esta fue entre dos
 * CONSULTAS, que ese test no podia ver.
 *
 * POR QUE PRERENDERIZAR Y NO ESCONDER DEL SITEMAP
 *
 * Las subsecciones son paginas reales: `/api/issues/cultura-arte` responde con
 * nombre, descripcion, criterios de evaluacion y `parentId`, y `IssuePage` las
 * renderiza con la misma ruta `/issues/:slug` que las madres. Filtrarlas del
 * sitemap habria tapado el sintoma y perdido 18 paginas indexables. Es el mismo
 * razonamiento con que `4f490e6` resolvio las diez rutas estaticas.
 *
 * La logica vive aca y no dentro de `vite.config.ts` porque una config de build
 * no se puede importar en un test.
 */

/** Lo unico que este modulo necesita del payload de `/api/issues`. */
export interface IssueConSubsecciones {
  slug: string
  children?: { slug: string }[]
}

/** El prefijo de `<Route path="/issues/:slug">` en `App.tsx`. */
export const PREFIJO_SECCION = '/issues'

/**
 * Aplana madres y subsecciones a rutas prerenderizables.
 *
 * Preserva el orden en que llegan —madre y despues sus hijas— y descarta
 * repetidos y slugs vacios, porque un slug vacio produciria `/issues/`, que no
 * es ninguna pagina y el prerender igual intentaria.
 */
export function rutasDeSecciones(issues: IssueConSubsecciones[]): string[] {
  const slugs: string[] = []

  for (const issue of issues) {
    slugs.push(issue.slug)
    for (const hija of issue.children ?? []) {
      slugs.push(hija.slug)
    }
  }

  return [...new Set(slugs.filter(Boolean))].map((slug) => `${PREFIJO_SECCION}/${slug}`)
}
