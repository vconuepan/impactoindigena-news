import { ReactNode } from 'react'
import { BRAND, SITE_URL } from '../config'
// Shared SEO constants
export const SEO = {
  siteName: 'Voces Indígenas',
  siteUrl: SITE_URL,
  defaultTitle: 'Voces Indígenas - Noticias que importan a los pueblos indígenas',
  defaultDescription: `${BRAND.claim} ${BRAND.claimSupport}`,
  ogImage: `${SITE_URL}/images/og-image.png`,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  twitterCard: 'summary_large_image' as const,
}
/**
 * Common OG meta tags that should appear on every page.
 * Use inside <Helmet> after page-specific tags.
 * Returns an array (not fragment) for react-helmet-async compatibility.
 */
export function CommonOgTags({
  image = SEO.ogImage,
  title,
  description,
}: {
  image?: string
  title?: string
  description?: string
}): ReactNode {
  // Only declare width/height for the default OG image — we know its exact dimensions.
  // For story images (scraped from external sources) the actual size is unknown,
  // so omitting width/height prevents LinkedIn/Facebook from rejecting the card
  // due to a dimension mismatch.
  const isDefaultOgImage = image === SEO.ogImage
  return [
    <meta key="og:site_name" property="og:site_name" content={SEO.siteName} />,
    <meta key="og:image" property="og:image" content={image} />,
    ...(isDefaultOgImage
      ? [
          <meta key="og:image:width" property="og:image:width" content={SEO.ogImageWidth} />,
          <meta key="og:image:height" property="og:image:height" content={SEO.ogImageHeight} />,
        ]
      : []),
    <meta key="twitter:card" name="twitter:card" content={SEO.twitterCard} />,
    <meta key="twitter:image" name="twitter:image" content={image} />,
    ...(title ? [<meta key="twitter:title" name="twitter:title" content={title} />] : []),
    ...(description ? [<meta key="twitter:description" name="twitter:description" content={description.slice(0, 200)} />] : []),
  ]
}

/**
 * El juego completo de una página fija: título y descripción para las
 * tarjetas, `og:url` y canónica a la ruta, y las etiquetas comunes.
 *
 * Desde el 8-nov-2026 `index.html` no trae etiquetas sociales fijas (llevaban
 * a «/» y ganaban por ir primero; ver el comentario allí). Una página que no
 * pone las suyas sale sin tarjeta propia, y `etiquetas-sociales.test.ts` falla.
 * Se llama dentro de `<Helmet>` como `CommonOgTags`: Helmet solo lee sus hijos
 * directos, así que esto devuelve un arreglo y no un componente.
 */
export function etiquetasDePagina({
  titulo,
  descripcion,
  ruta,
}: {
  titulo: string
  descripcion: string
  ruta: string
}): ReactNode {
  const url = `${SEO.siteUrl}${ruta}`
  return [
    <meta key="og:title" property="og:title" content={titulo} />,
    <meta key="og:description" property="og:description" content={descripcion} />,
    <meta key="og:type" property="og:type" content="website" />,
    <meta key="og:url" property="og:url" content={url} />,
    <link key="canonical" rel="canonical" href={url} />,
    ...(CommonOgTags({ title: titulo, description: descripcion }) as ReactNode[]),
  ]
}
