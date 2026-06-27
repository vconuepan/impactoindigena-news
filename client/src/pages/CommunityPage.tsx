import { useState, useEffect } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useCommunity, useCommunityStories, useMembership, useJoinCommunity, useLeaveCommunity, useCommunitySignals } from '../hooks/useCommunities'
import StoryCard from '../components/StoryCard'
import Pagination from '../components/Pagination'
import { SEO, CommonOgTags } from '../lib/seo'
import { communityDotColor } from '../lib/category-colors'
import { publicApi, memberAuth } from '../lib/api'
import type { PublicStory } from '@shared/types'

const PAGE_SIZE = 20

function ShareBar({ communityName }: { communityName: string }) {
  const [copied, setCopied] = useState(false)
  const url = window.location.href.split('?')[0]
  const waText = encodeURIComponent(`${communityName} — noticias curadas por IA: ${url}`)

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-center gap-3 mt-4 ml-5">
      <span className="text-xs text-neutral-400">Compartir:</span>
      <button
        onClick={handleCopy}
        className="text-xs px-3 py-1 rounded-full border border-neutral-200 text-neutral-600 hover:border-brand-300 hover:text-brand-700 transition-colors"
      >
        {copied ? 'Copiado' : 'Copiar URL'}
      </button>
      <a
        href={`https://wa.me/?text=${waText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs px-3 py-1 rounded-full border border-neutral-200 text-neutral-600 hover:border-green-400 hover:text-green-700 transition-colors"
      >
        WhatsApp
      </a>
    </div>
  )
}

function JoinBlock({ slug, communityName, communityType }: { slug: string; communityName: string; communityType: string }) {
  const navigate = useNavigate()
  // isAuthenticated() reads a non-httpOnly cookie — safe in private mode (returns false on error)
  const isAuthed = memberAuth.isAuthenticated()
  const isPueblo = communityType === 'PUEBLO'
  const [consentChecked, setConsentChecked] = useState(false)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { data: membership } = useMembership(slug)
  const joinMutation = useJoinCommunity(slug)
  const leaveMutation = useLeaveCommunity(slug)

  // Auto-join only for non-PUEBLO communities. PUEBLO requires explicit consent
  // (membership reveals ethnic origin, a sensitive datum — Ley 21.719 Art. 16).
  const joinMutate = joinMutation.mutate
  useEffect(() => {
    if (isAuthed && !isPueblo && membership !== undefined && !membership.isMember) {
      joinMutate(undefined)
    }
  }, [isAuthed, isPueblo, membership, joinMutate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const redirectTo = `/comunidad/${slug}`
      await publicApi.auth.requestMagicLink(email.trim(), redirectTo)
      navigate(`/magic-sent?email=${encodeURIComponent(email.trim())}&redirect_to=${encodeURIComponent(redirectTo)}`)
    } catch (err: any) {
      setError(err.message || 'Error al enviar el enlace. Intenta de nuevo.')
      setSubmitting(false)
    }
  }

  async function handleLeave() {
    await leaveMutation.mutateAsync()
  }

  const consentNotice = (
    <label className="flex items-start gap-2 text-left text-xs text-neutral-600">
      <input
        type="checkbox"
        checked={consentChecked}
        onChange={(e) => setConsentChecked(e.target.checked)}
        className="mt-0.5 shrink-0"
      />
      <span>
        Entiendo que unirme a esta comunidad-pueblo revela mi pertenencia y origen
        étnico (dato sensible) y <strong>consiento</strong> su tratamiento conforme a la{" "}
        <Link to="/privacy" className="text-brand-800 underline">Política de Privacidad</Link>.
        Puedo retirarlo abandonando la comunidad.
      </span>
    </label>
  )

  // Authenticated member
  if (isAuthed && membership?.isMember) {
    // Legacy PUEBLO member who never gave express consent → non-blocking prompt
    if (isPueblo && membership.consented === false) {
      return (
        <div className="mt-10 border-t border-neutral-100 pt-8">
          <div className="max-w-md mx-auto text-center flex flex-col gap-3">
            <p className="text-sm font-medium text-neutral-700">Confirma tu consentimiento</p>
            <p className="text-xs text-neutral-500">
              Esta es una comunidad-pueblo. Necesitamos tu consentimiento expreso para
              mantener tu membresía conforme a la Ley 21.719.
            </p>
            {consentNotice}
            <button
              onClick={() => joinMutate(true)}
              disabled={!consentChecked || joinMutation.isPending}
              className="self-center px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {joinMutation.isPending ? '...' : 'Confirmar consentimiento'}
            </button>
            <button
              onClick={handleLeave}
              disabled={leaveMutation.isPending}
              className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
            >
              {leaveMutation.isPending ? 'Saliendo...' : 'Abandonar comunidad'}
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="mt-10 border-t border-neutral-100 pt-8 flex flex-col items-center text-center gap-3">
        <p className="text-sm font-medium text-neutral-700">Eres miembro de esta comunidad</p>
        <button
          onClick={handleLeave}
          disabled={leaveMutation.isPending}
          className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
        >
          {leaveMutation.isPending ? 'Saliendo...' : 'Abandonar comunidad'}
        </button>
      </div>
    )
  }

  // Authenticated, not a member, PUEBLO → explicit consent gate (no silent auto-join)
  if (isAuthed && isPueblo && membership && !membership.isMember) {
    return (
      <div className="mt-10 border-t border-neutral-100 pt-8">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold mb-1">Únete a {communityName}</h2>
          <p className="text-sm text-neutral-500 mb-4">
            Recibe las noticias más relevantes de esta comunidad en tu correo.
          </p>
          <div className="mb-4">{consentNotice}</div>
          <button
            onClick={() => joinMutate(true)}
            disabled={!consentChecked || joinMutation.isPending}
            className="px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {joinMutation.isPending ? '...' : 'Confirmar unión'}
          </button>
          {joinMutation.isError && <p className="text-xs text-red-600 mt-2">No se pudo unir. Intenta de nuevo.</p>}
        </div>
      </div>
    )
  }

  // Authenticated but membership still loading (or non-PUEBLO auto-join in progress)
  if (isAuthed) {
    return (
      <div className="mt-10 border-t border-neutral-100 pt-8 text-center">
        <p className="text-sm text-neutral-400">{joinMutation.isPending ? 'Uniéndote…' : 'Cargando…'}</p>
      </div>
    )
  }

  // Anonymous → request a magic link
  return (
    <div className="mt-10 border-t border-neutral-100 pt-8">
      <div className="max-w-md mx-auto text-center">
        <h2 className="text-lg font-semibold mb-1">Únete a {communityName}</h2>
        <p className="text-sm text-neutral-500 mb-5">
          Recibe las noticias más relevantes de esta comunidad directo en tu correo.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            className="flex-1 px-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '...' : 'Unirme'}
          </button>
        </form>
        {isPueblo && (
          <p className="text-xs text-neutral-400 mt-2">
            Al unirte te pediremos tu consentimiento expreso (es una comunidad-pueblo).
          </p>
        )}
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  )
}

const EMOTION_LABEL: Record<string, string> = {
  uplifting: 'Alentador',
  frustrating: 'Frustrante',
  scary: 'Preocupante',
  calm: 'Informativo',
}

const EMOTION_COLOR: Record<string, string> = {
  uplifting: '#059669',
  frustrating: '#d97706',
  scary: '#dc2626',
  calm: '#6366f1',
}

function CommunitySignalPanel({ slug }: { slug: string }) {
  const { data: signals, isLoading } = useCommunitySignals(slug, true)

  if (isLoading) {
    return (
      <div className="mb-8 rounded-xl border border-brand-100 bg-brand-50 p-5 animate-pulse">
        <div className="h-3 w-32 bg-brand-100 rounded mb-4" />
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-brand-100 rounded-lg" />)}
        </div>
        <div className="h-3 w-24 bg-brand-100 rounded" />
      </div>
    )
  }

  if (!signals) return null

  const { coverage, relevance, topics, emotion, recentHeadlines } = signals
  const totalRelevance = relevance.high + relevance.medium + relevance.low || 1
  const topTopics = topics.slice(0, 3)
  const totalEmotion = emotion.reduce((sum, e) => sum + e._count.id, 0) || 1

  return (
    <div className="mb-8 rounded-xl border border-brand-100 bg-brand-50 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-brand-500" aria-hidden="true" />
          <p className="text-xs font-semibold text-brand-800 uppercase tracking-wider">
            Panel de miembro · últimos 30 días
          </p>
        </div>
        <span className="text-xs text-brand-600 bg-brand-100 px-2.5 py-0.5 rounded-full font-medium">
          Miembro
        </span>
      </div>

      {/* Coverage stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-lg p-3 border border-brand-100 text-center">
          <p className="text-2xl font-bold text-neutral-900">{coverage.stories30d}</p>
          <p className="text-xs text-neutral-500 mt-0.5 leading-tight">noticias este mes</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-brand-100 text-center">
          <p className="text-2xl font-bold text-neutral-900">{coverage.stories7d}</p>
          <p className="text-xs text-neutral-500 mt-0.5 leading-tight">esta semana</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-brand-100 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {Math.round((relevance.high / totalRelevance) * 100)}%
          </p>
          <p className="text-xs text-neutral-500 mt-0.5 leading-tight">alta relevancia</p>
        </div>
      </div>

      {/* Topics */}
      {topTopics.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-medium text-neutral-500 mb-2">Principales temas cubiertos</p>
          <div className="flex flex-wrap gap-2">
            {topTopics.map((t) => (
              <Link
                key={t.issueSlug}
                to={`/issues/${t.issueSlug}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-800 bg-white border border-brand-200 hover:border-brand-400 hover:bg-brand-100 px-3 py-1 rounded-full transition-colors"
              >
                {t.issueName}
                <span className="text-brand-500">({t._count.id})</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Emotion distribution */}
      {emotion.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-medium text-neutral-500 mb-2">Tono de la cobertura</p>
          <div className="space-y-1.5">
            {emotion.map((e) => {
              const pct = Math.round((e._count.id / totalEmotion) * 100)
              const color = EMOTION_COLOR[e.emotionTag] ?? '#6b7280'
              const label = EMOTION_LABEL[e.emotionTag] ?? e.emotionTag
              return (
                <div key={e.emotionTag} className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 w-24 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-xs text-neutral-400 w-8 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent headlines */}
      {recentHeadlines.length > 0 && (
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-2">Titulares recientes</p>
          <ul className="space-y-1.5">
            {recentHeadlines.slice(0, 3).map((h) => (
              <li key={h.id}>
                <Link
                  to={`/s/${h.slug}`}
                  className="text-xs text-neutral-700 hover:text-brand-700 transition-colors line-clamp-1"
                >
                  {h.headline}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StoryGrid({ stories }: { stories: PublicStory[] }) {
  if (stories.length === 0) return null
  const [first, ...rest] = stories
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <StoryCard story={first} variant="featured" />
        </div>
        {rest.length > 0 && (
          <div className="space-y-3">
            {rest.slice(0, 4).map((s) => (
              <StoryCard key={s.id} story={s} variant="compact" />
            ))}
          </div>
        )}
      </div>
      {rest.length > 4 && (
        <div className="grid gap-5 md:grid-cols-3">
          {rest.slice(4).map((s) => (
            <StoryCard key={s.id} story={s} variant="equal" />
          ))}
        </div>
      )}
    </div>
  )
}

export default function CommunityPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') ?? '1', 10) || 1

  // Auth is now cookie-based — no token in URL to capture.
  // (Previously stored member_token in localStorage; now the httpOnly cookie is set
  //  server-side by GET /api/auth/magic/verify before redirecting here.)

  const { data: community, isLoading: communityLoading, isError: communityError } = useCommunity(slug ?? '')
  const { data: storiesData, isLoading: storiesLoading } = useCommunityStories(slug ?? '', { page, pageSize: PAGE_SIZE })
  const { data: membership } = useMembership(slug ?? '')

  const isLoading = communityLoading || storiesLoading
  const stories = storiesData?.data ?? []
  const totalPages = storiesData?.totalPages ?? 1

  if (communityError || (!communityLoading && !community)) {
    return (
      <div className="page-section text-center">
        <h1 className="page-title">Comunidad no encontrada</h1>
        <p className="text-neutral-500 mb-6">Esta comunidad no existe o fue eliminada.</p>
        <Link to="/comunidades" className="text-brand-800 hover:text-brand-700 font-normal focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1">
          &larr; Ver todas las comunidades
        </Link>
      </div>
    )
  }

  const ogTitle = community ? `${community.name} — ${SEO.siteName}` : SEO.siteName
  const ogDesc = community?.description ?? ''
  const ogImage = community?.imageUrl ?? undefined

  return (
    <>
      {community && (
        <Helmet>
          <title>{ogTitle}</title>
          <meta name="description" content={ogDesc.slice(0, 160)} />
          <meta property="og:title" content={ogTitle} />
          <meta property="og:description" content={ogDesc.slice(0, 200)} />
          <meta property="og:type" content="website" />
          <meta property="og:url" content={`${SEO.siteUrl}/comunidad/${slug}`} />
          <link rel="canonical" href={`${SEO.siteUrl}/comunidad/${slug}`} />
          {CommonOgTags({ image: ogImage })}
        </Helmet>
      )}

      <div className="page-section-wide">
        {/* Breadcrumb */}
        <Link
          to="/comunidades"
          className="text-xs text-brand-800 hover:text-brand-700 font-normal focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5 mb-3 inline-block"
        >
          &larr; Comunidades
        </Link>

        {/* Header */}
        {isLoading && !community ? (
          <div className="mb-6">
            <div className="h-7 w-48 bg-neutral-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-96 bg-neutral-100 rounded animate-pulse" />
          </div>
        ) : community && (
          <header className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-3 h-3 rounded-full shrink-0 ${communityDotColor(community.type)}`}
                aria-hidden="true"
              />
              <h1 className="text-2xl md:text-3xl font-bold">{community.name}</h1>
            </div>
            <div className="flex items-center gap-3 ml-5">
              {community.region && (
                <p className="text-xs text-neutral-400">{community.region}</p>
              )}
              {community.memberCount !== undefined && community.memberCount > 0 && (
                <p className="text-xs text-neutral-400">
                  {community.memberCount} {community.memberCount === 1 ? 'miembro' : 'miembros'}
                </p>
              )}
            </div>
            <p className="text-sm text-neutral-600 mt-2 ml-5 max-w-2xl">{community.description}</p>
            <ShareBar communityName={community.name} />
          </header>
        )}

        {/* Member signal panel — only shown to authenticated members */}
        {membership?.isMember && slug && <CommunitySignalPanel slug={slug} />}

        {/* Stories */}
        {storiesLoading && (
          <div className="grid gap-5 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-neutral-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!storiesLoading && stories.length > 0 && (
          <>
            <StoryGrid stories={stories} />
            <Pagination
              page={storiesData?.page ?? 1}
              totalPages={totalPages}
              onPageChange={(newPage) => {
                setSearchParams((prev) => {
                  if (newPage === 1) prev.delete('page')
                  else prev.set('page', String(newPage))
                  return prev
                })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </>
        )}

        {!storiesLoading && stories.length === 0 && (
          <p className="text-neutral-500 py-8 text-center">
            Aún no hay noticias publicadas para esta comunidad.
          </p>
        )}

        {community && slug && (
          <JoinBlock slug={slug} communityName={community.name} communityType={community.type} />
        )}
      </div>
    </>
  )
}
