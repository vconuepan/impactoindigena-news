import { Helmet } from 'react-helmet-async'
import { SEO } from '../lib/seo'

/**
 * Le pide a Google que no indexe la página. Para los estados «no encontrado».
 *
 * El sitio es una aplicación de una sola página: Azure Static Web Apps responde
 * toda ruta desconocida con la portada prerenderizada y estado 200, así que una
 * URL inventada llegaba al buscador como una copia de la portada, con
 * `canonical` a la portada e `index, follow` (soft 404, medido el 2-nov-2026).
 * Google documenta dos salidas para ese caso; esta es una de ellas: agregar
 * `noindex` por JavaScript en la página de error. La etiqueta fija de
 * `index.html` dice `index`; ante dos reglas, Google aplica la más restrictiva.
 * Es el mismo patrón que ya usan la búsqueda y el perfil.
 */
export default function NoIndex() {
  return (
    <Helmet>
      <meta name="robots" content="noindex" />
    </Helmet>
  )
}

/**
 * El título de pestaña de un estado sin página: «no encontrado» o «servicio no
 * disponible». Sin esto, esos estados conservaban el título de la portada que
 * trae el HTML prerenderizado (medido el 2-nov-2026 en tema, comunidad y
 * noticia), y la pestaña y el historial decían «Voces Indígenas - Noticias que
 * importan…» sobre una página de error. Va con el mismo texto del encabezado.
 */
export function TituloDeEstado({ texto }: { texto: string }) {
  return (
    <Helmet>
      <title>{`${texto} - ${SEO.siteName}`}</title>
    </Helmet>
  )
}
