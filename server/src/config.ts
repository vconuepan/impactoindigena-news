export const config = {
  /** Canonical public URL for the site — used in social media posts, RSS feeds, sitemaps, etc. */
  siteUrl: process.env.SITE_URL || 'https://impactoindigena.news',
  llm: {
    // Set LLM_PROVIDER to switch providers:
    //   openai (default) — uses OPENAI_API_KEY directly
    //   openrouter      — uses OPENROUTER_API_KEY with OpenRouter base URL
    //   azure           — uses Azure OpenAI (AZURE_OPENAI_* vars); no OPENAI_API_KEY needed
    provider: (process.env.LLM_PROVIDER || 'openai') as 'openai' | 'openrouter' | 'azure',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    azure: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',       // e.g. https://my-resource.openai.azure.com
      apiKey: process.env.AZURE_OPENAI_API_KEY || '',
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview',
      deployments: {
        small:     process.env.AZURE_OPENAI_DEPLOYMENT_SMALL     || 'gpt-4o-mini',
        medium:    process.env.AZURE_OPENAI_DEPLOYMENT_MEDIUM    || 'gpt-4o-mini',
        large:     process.env.AZURE_OPENAI_DEPLOYMENT_LARGE     || 'gpt-4o',
        embedding: process.env.AZURE_OPENAI_DEPLOYMENT_EMBEDDING || 'text-embedding-3-small',
        tts:       process.env.AZURE_OPENAI_DEPLOYMENT_TTS       || 'tts-1-hd',
        dalle:     process.env.AZURE_OPENAI_DEPLOYMENT_DALLE     || 'dall-e-3',
      },
    },
    models: {
      small: {
        // OpenRouter example: deepseek/deepseek-chat-v3-5
        name: process.env.OPENAI_MODEL_SMALL || "gpt-5.4-mini",
        // reasoningEffort only applies to OpenAI reasoning models (ignored for OpenRouter)
        reasoningEffort: "medium" as const,
      },
      medium: {
        // OpenRouter example: deepseek/deepseek-chat-v3-5
        name: process.env.OPENAI_MODEL_MEDIUM || "gpt-5.4-mini",
        reasoningEffort: "medium" as const,
      },
      large: {
        // OpenRouter example: deepseek/deepseek-chat-v3-5 or openai/gpt-4.1
        name: process.env.OPENAI_MODEL_LARGE || "gpt-5.4",
        reasoningEffort: "medium" as const,
      },
    },
    delayMs: parseInt(process.env.LLM_DELAY_MS || "500", 10),
  },
  preassess: {
    batchSize: 10,
    contentMaxLength: 1200,
    modelTier: "medium" as const,
  },
  assess: {
    contentMaxLength: 4000,
    fullAssessmentThreshold: 5,
    modelTier: "medium" as const,
  },
  selection: {
    maxGroupSize: parseInt(process.env.SELECT_MAX_GROUP_SIZE || "20", 10),
    ratio: parseFloat(process.env.SELECT_RATIO || "0.5"),
    relevanceMin: parseInt(process.env.SELECT_RELEVANCE_MIN || "5", 10),
    modelTier: "large" as const,
  },
  embedding: {
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    // Changing dimensions requires a DB migration to alter the vector(1536) column and rebuild the index
    dimensions: 1536,
    batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '100', 10),
    concurrency: parseInt(process.env.EMBEDDING_CONCURRENCY || '5', 10),
    delayMs: parseInt(process.env.EMBEDDING_DELAY_MS || '100', 10),
  },
  crawl: {
    rssItemLimit: parseInt(process.env.RSS_ITEM_LIMIT || "30", 10),
    /** Reject articles whose RSS pubDate is older than this many days (Google News resurfacing). 0 = no limit. */
    maxArticleAgeDays: parseInt(process.env.MAX_ARTICLE_AGE_DAYS || "60", 10),
    httpTimeoutMs: parseInt(process.env.HTTP_TIMEOUT_MS || "10000", 10),
    minContentLength: parseInt(process.env.MIN_CONTENT_LENGTH || "300", 10),
    staleAfterEmptyCrawls: parseInt(
      process.env.STALE_AFTER_EMPTY_CRAWLS || "5",
      10
    ),
    extractionApi: (process.env.EXTRACTION_API || "diffbot") as
      | "diffbot"
      | "pipfeed",
    diffbotTimeoutMs: parseInt(process.env.DIFFBOT_TIMEOUT_MS || "15000", 10),
    diffbotRateLimit: parseInt(process.env.DIFFBOT_RATE_LIMIT || "5", 10),
    pipfeedTimeoutMs: parseInt(process.env.PIPFEED_TIMEOUT_MS || "15000", 10),
    maxConcurrencyPerDomain: parseInt(
      process.env.MAX_CONCURRENCY_PER_DOMAIN || "2",
      10
    ),
    minDelayPerDomainMs: parseInt(
      process.env.MIN_DELAY_PER_DOMAIN_MS || "200",
      10
    ),
    localFailThreshold: parseInt(process.env.LOCAL_FAIL_THRESHOLD || "3", 10),
    totalFailThreshold: parseInt(process.env.TOTAL_FAIL_THRESHOLD || "3", 10),
  },
  content: {
    // Must be at least 2× the newsletter dedup window (7 days) so the second
    // weekly send always has a fresh pool to draw from.
    storyAssignmentDays: parseInt(process.env.STORY_ASSIGNMENT_DAYS || "14", 10),
  },
  newsletter: {
    storiesPerIssue: parseInt(
      process.env.NEWSLETTER_STORIES_PER_ISSUE || "4",
      10
    ),
    selectModelTier: "large" as const,
    contentModelTier: "large" as const,
  },
  feed: {
    size: parseInt(process.env.RSS_FEED_SIZE || "50", 10),
    cacheMaxAge: parseInt(process.env.RSS_CACHE_MAX_AGE || "900", 10),
  },
  sitemap: {
    cacheMaxAge: parseInt(process.env.SITEMAP_CACHE_MAX_AGE || "3600", 10),
  },
  rateLimit: {
    publicWindowMs: parseInt(
      process.env.RATE_LIMIT_PUBLIC_WINDOW_MS || String(15 * 60 * 1000),
      10
    ),
    publicMax: parseInt(process.env.RATE_LIMIT_PUBLIC_MAX || "100", 10),
    expensiveWindowMs: parseInt(
      process.env.RATE_LIMIT_EXPENSIVE_WINDOW_MS || String(60 * 60 * 1000),
      10
    ),
    expensiveMax: parseInt(process.env.RATE_LIMIT_EXPENSIVE_MAX || "1000", 10),
    searchWindowMs: parseInt(process.env.RATE_LIMIT_SEARCH_WINDOW_MS || String(15 * 60 * 1000), 10),
    searchMax: parseInt(process.env.RATE_LIMIT_SEARCH_MAX || "20", 10),
  },
  concurrency: {
    preassess: parseInt(process.env.CONCURRENCY_PREASSESS || "10", 10),
    assess: parseInt(process.env.CONCURRENCY_ASSESS || "10", 10),
    select: parseInt(process.env.CONCURRENCY_SELECT || "10", 10),
    reclassify: parseInt(process.env.CONCURRENCY_RECLASSIFY || "10", 10),
    crawlFeeds: parseInt(process.env.CONCURRENCY_CRAWL_FEEDS || "3", 10),
    crawlArticles: parseInt(process.env.CONCURRENCY_CRAWL_ARTICLES || "3", 10),
  },
  brevo: {
    apiKey: process.env.BREVO_API_KEY || "",
    fromEmail: process.env.BREVO_FROM_EMAIL || "",
    fromName: process.env.BREVO_FROM_NAME || "Impacto Indígena",
    testSegmentId: process.env.BREVO_TEST_SEGMENT_ID || "",
  },
  // Operational alerts when a scheduled job fails (e.g. dead LLM key).
  alerts: {
    // Email that receives job-failure alerts. Empty disables email alerts.
    failureEmail: process.env.ALERT_EMAIL || "venancio@conuepan.cl",
    // At most one email per job per this many hours, so a job that keeps
    // failing every cron tick doesn't flood the inbox.
    throttleHours: parseInt(process.env.ALERT_THROTTLE_HOURS || "6", 10),
  },
  subscribe: {
    confirmTokenExpiryHours: parseInt(
      process.env.SUBSCRIBE_TOKEN_EXPIRY_HOURS || "24",
      10
    ),
    rateLimitWindowMs: parseInt(
      process.env.SUBSCRIBE_RATE_LIMIT_WINDOW_MS || String(60 * 1000),
      10
    ),
    rateLimitMax: parseInt(process.env.SUBSCRIBE_RATE_LIMIT_MAX || "3", 10),
  },
  relatedStories: {
    displayCount: 4,
    candidateMultiplier: 3, // fetch 12 candidates for 4 results
    cacheHours: 72, // 3 days in-memory
    httpCacheSeconds: 259200, // 3 days
    modelTier: 'small' as const,
  },
  feedQuality: {
    cacheMinutes: 10,
  },
  dedup: {
    maxCandidates: parseInt(process.env.DEDUP_MAX_CANDIDATES || '6', 10),
    timeWindowDays: parseInt(process.env.DEDUP_TIME_WINDOW_DAYS || '14', 10),
    enabled: process.env.DEDUP_ENABLED !== 'false',
    modelTier: 'small' as const,
  },
  bluesky: {
    handle: process.env.BLUESKY_HANDLE || '',
    appPassword: process.env.BLUESKY_APP_PASSWORD || '',
    serviceUrl: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social',
    autoPost: {
      enabled: process.env.BLUESKY_AUTO_POST_ENABLED === 'true',
      lookbackHours: parseInt(process.env.BLUESKY_LOOKBACK_HOURS || '25', 10),
    },
    metrics: {
      maxAgeDays: parseInt(process.env.BLUESKY_METRICS_MAX_AGE_DAYS || '30', 10),
    },
    postDelayMs: parseInt(process.env.BLUESKY_POST_DELAY_MS || '2000', 10),
    postModelTier: 'medium' as const,
    pickModelTier: 'medium' as const,
  },
  mastodon: {
    instanceUrl: process.env.MASTODON_URL || '',
    accessToken: process.env.MASTODON_TOKEN || '',
    autoPost: {
      enabled: process.env.MASTODON_AUTO_POST_ENABLED === 'true',
    },
    metrics: {
      maxAgeDays: parseInt(process.env.MASTODON_METRICS_MAX_AGE_DAYS || '30', 10),
    },
    postDelayMs: parseInt(process.env.MASTODON_POST_DELAY_MS || '2000', 10),
    postModelTier: 'medium' as const,
    visibility: (process.env.MASTODON_VISIBILITY || 'unlisted') as 'public' | 'unlisted' | 'private',
    charLimit: parseInt(process.env.MASTODON_CHAR_LIMIT || '500', 10),
  },
  feedback: {
    rateLimitWindowMs: parseInt(process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS || String(60 * 60 * 1000), 10),
    rateLimitMax: parseInt(process.env.FEEDBACK_RATE_LIMIT_MAX || '3', 10),
    messageMaxLength: 2000,
  },
  community: {
    // Version stamped on express consent for PUEBLO-community membership
    // (Ley 21.719 Art. 16). Bump when the consent copy/scope changes.
    consentVersion: process.env.CONSENT_VERSION || '1.0',
  },
  agenda: {
    // "Incidencia Internacional" ingestion (Fase 2b): OHCHR scrape + LLM enrich.
    ohchrEnabled: process.env.AGENDA_OHCHR_ENABLED !== 'false',
    ohchrMaxPages: parseInt(process.env.AGENDA_OHCHR_MAX_PAGES || '4', 10),
    // Fase 2c: scrape de comunicados de prensa de la Corte IDH (español nativo,
    // alto valor jurídico), filtrados por tema indígena.
    corteIdhEnabled: process.env.AGENDA_CORTEIDH_ENABLED !== 'false',
    // Per-run caps on LLM enrichment (bounds cost; the daily job catches up over time).
    enrichDateLimit: parseInt(process.env.AGENDA_ENRICH_DATE_LIMIT || '20', 10),
    enrichTranslateLimit: parseInt(process.env.AGENDA_ENRICH_TRANSLATE_LIMIT || '20', 10),
    enrichContentMaxChars: parseInt(process.env.AGENDA_ENRICH_CONTENT_MAX_CHARS || '6000', 10),
    // Fase 3: resumen semanal de "Incidencia Internacional" a redes (teaser + enlace a la sección).
    digest: {
      enabled: process.env.AGENDA_DIGEST_ENABLED !== 'false',
      // Ventanas de selección: cuántos días hacia adelante contamos deadlines/eventos como
      // "de la semana", y cuántos días atrás una publicación cuenta como novedad.
      dueWithinDays: parseInt(process.env.AGENDA_DIGEST_DUE_WITHIN_DAYS || '21', 10),
      eventWithinDays: parseInt(process.env.AGENDA_DIGEST_EVENT_WITHIN_DAYS || '30', 10),
      publishedWithinDays: parseInt(process.env.AGENDA_DIGEST_PUBLISHED_WITHIN_DAYS || '7', 10),
      channels: {
        bluesky: process.env.AGENDA_DIGEST_BLUESKY !== 'false',
        mastodon: process.env.AGENDA_DIGEST_MASTODON !== 'false',
        twitter: process.env.AGENDA_DIGEST_TWITTER !== 'false',
        instagram: process.env.AGENDA_DIGEST_INSTAGRAM !== 'false',
      },
      postDelayMs: parseInt(process.env.AGENDA_DIGEST_POST_DELAY_MS || '2000', 10),
    },
  },
  socialAutoPost: {
    lookbackHours: parseInt(process.env.SOCIAL_LOOKBACK_HOURS || process.env.BLUESKY_LOOKBACK_HOURS || '25', 10),
    pickModelTier: 'medium' as const,
  },
  twitter: {
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
    autoPost: {
      enabled: process.env.TWITTER_AUTO_POST_ENABLED === 'true',
    },
    metrics: {
      maxAgeDays: parseInt(process.env.TWITTER_METRICS_MAX_AGE_DAYS || '7', 10),
    },
  },
  imageGen: {
    // Recurso Azure separado para generación de imágenes (Sweden Central — soporta gpt-image-2)
    // Si no está configurado, usa el recurso LLM principal como fallback
    endpoint:   process.env.AZURE_IMAGE_ENDPOINT   || '',
    apiKey:     process.env.AZURE_IMAGE_API_KEY     || '',
    apiVersion: process.env.AZURE_IMAGE_API_VERSION || '2025-04-01-preview',
    deployment: process.env.AZURE_IMAGE_DEPLOYMENT  || 'gpt-image-2',
    // Calidad del hero landscape del sitio web. El hero se muestra a max-height
    // 480px, así que 'medium' (~$0.05/img) rinde igual que 'high' (~$0.17/img)
    // en pantalla. Subir a 'high' solo si un cambio de layout lo agranda.
    quality:    (process.env.AZURE_IMAGE_QUALITY    || 'medium') as 'low' | 'medium' | 'high',
    // Calidad del portrait para redes (Instagram/Twitter recomprimen al subir, así que
    // 'high' es gasto perdido). Medium recorta ~60-70% el costo sin diferencia visible en el feed.
    qualityPortrait: (process.env.AZURE_IMAGE_QUALITY_PORTRAIT || 'medium') as 'low' | 'medium' | 'high',
    // El hero IA propio solo se genera para historias destacadas (relevance >=
    // este umbral, el mismo del EditorialSeal). El resto reusa el og:image de la
    // fuente (gratis), acotando el costo de imágenes al valor editorial.
    heroAiMinRelevance: parseInt(process.env.AZURE_IMAGE_HERO_MIN_RELEVANCE || '8', 10),
  },
  r2: {
    endpoint: process.env.R2_ENDPOINT || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'impacto-indigena-media',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },
  instagram: {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
    userId: process.env.INSTAGRAM_USER_ID || '',
    autoPost: {
      enabled: process.env.INSTAGRAM_AUTO_POST_ENABLED === 'true',
    },
    metrics: {
      maxAgeDays: parseInt(process.env.INSTAGRAM_METRICS_MAX_AGE_DAYS || '30', 10),
    },
  },
  linkedin: {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN || '',
    authorUrn: process.env.LINKEDIN_AUTHOR_URN || '',
    autoPost: {
      enabled: process.env.LINKEDIN_AUTO_POST_ENABLED === 'true',
    },
    metrics: {
      maxAgeDays: parseInt(process.env.LINKEDIN_METRICS_MAX_AGE_DAYS || '30', 10),
    },
  },
  podcast: {
    autoGenerate: {
      enabled: process.env.PODCAST_AUTO_GENERATE_ENABLED === 'true',
    },
    storiesPerEpisode: parseInt(process.env.PODCAST_STORIES_PER_EPISODE || '4', 10),
    voice: (process.env.PODCAST_VOICE || 'nova') as 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer',
  },
} as const;
