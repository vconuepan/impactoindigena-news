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
