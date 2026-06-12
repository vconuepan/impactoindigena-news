import type { PublicStory } from '@shared/types'
import type { PublicIssue } from './api'
import { SEO } from './seo'

const LOGO_URL = `${SEO.siteUrl}/images/logo-horizontal.png`

const publisher = {
  '@type': 'Organization',
  name: SEO.siteName,
  url: SEO.siteUrl,
  logo: {
    '@type': 'ImageObject',
    url: LOGO_URL,
  },
}

export function buildArticleSchema(story: PublicStory) {
  const displayTitle =
    story.titleLabel && story.title
      ? `${story.titleLabel}: ${story.title}`
      : story.title || ''
  const issueName = story.issue?.name ?? story.feed?.issue?.name ?? 'News'

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: displayTitle.slice(0, 110),
    description: (story.summary || displayTitle).slice(0, 200),
    datePublished: story.datePublished || story.dateCrawled,
    author: {
      '@type': 'Organization',
      name: SEO.siteName,
      url: SEO.siteUrl,
    },
    publisher,
    mainEntityOfPage: `${SEO.siteUrl}/stories/${story.slug}`,
    image: story.imageUrl || SEO.ogImage,
    dateModified: story.datePublished || story.dateCrawled,
    articleSection: issueName,
    url: `${SEO.siteUrl}/stories/${story.slug}`,
  }
}

export function buildWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SEO.siteName,
    url: SEO.siteUrl,
    description: SEO.defaultDescription,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SEO.siteUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SEO.siteName,
    url: SEO.siteUrl,
    logo: LOGO_URL,
    sameAs: [
      'https://www.instagram.com/impactoindigena',
      'https://x.com/impactoindigena',
      'https://www.youtube.com/@impactoindigena',
    ],
  }
}

export function buildCollectionPageSchema(issue: PublicIssue) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${issue.name} - ${SEO.siteName}`,
    description: (issue.intro || issue.description).slice(0, 200),
    url: `${SEO.siteUrl}/issues/${issue.slug}`,
    isPartOf: {
      '@type': 'WebSite',
      name: SEO.siteName,
    },
  }
}

export function buildBreadcrumbSchema(items: { name: string; url?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  }
}
