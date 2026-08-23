import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import {
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import type { MastodonPostStatus, MastodonFeedItem, MastodonDbOnlyPost } from '@shared/types'
import { adminApi } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { ActionIconButton } from '../../components/ui/ActionIconButton'
import { useToast } from '../../components/ui/Toast'
import { formatRelativeTime } from '../../lib/constants'

const STATUS_COLORS: Record<MastodonPostStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

type FeedFilter = 'all' | 'tracked' | 'untracked' | 'draft' | 'failed'

export default function MastodonPage() {
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [feedItems, setFeedItems] = useState<MastodonFeedItem[]>([])
  const [dbOnlyPosts, setDbOnlyPosts] = useState<MastodonDbOnlyPost[]>([])
  const [nextMaxId, setNextMaxId] = useState<string | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Initial feed load
  const feedQuery = useQuery({
    queryKey: ['mastodonFeed'],
    queryFn: async () => {
      const result = await adminApi.mastodon.getFeed({ limit: 25 })
      setFeedItems(result.feed)
      setDbOnlyPosts(result.dbOnlyPosts)
      setNextMaxId(result.nextMaxId)
      return result
    },
  })

  const handleLoadMore = useCallback(async () => {
    if (!nextMaxId || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await adminApi.mastodon.getFeed({ maxId: nextMaxId, limit: 25 })
      setFeedItems((prev) => [...prev, ...result.feed])
      setNextMaxId(result.nextMaxId)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al cargar más')
    } finally {
      setLoadingMore(false)
    }
  }, [nextMaxId, loadingMore, toast])

  const handleDelete = useCallback(async (postId: string) => {
    if (!confirm('¿Eliminar esta publicación? Las publicadas también se eliminarán de Mastodon.')) return
    setDeletingId(postId)
    try {
      await adminApi.mastodon.deletePost(postId)
      toast('success', 'Publicación eliminada')
      queryClient.invalidateQueries({ queryKey: ['mastodonFeed'] })
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al eliminar publicación')
    } finally {
      setDeletingId(null)
    }
  }, [queryClient, toast])

  const handleRefreshMetrics = useCallback(async () => {
    setRefreshing(true)
    try {
      await adminApi.mastodon.refreshMetrics()
      toast('success', 'Métricas actualizadas')
      queryClient.invalidateQueries({ queryKey: ['mastodonFeed'] })
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al actualizar métricas')
    } finally {
      setRefreshing(false)
    }
  }, [queryClient, toast])

  // Apply client-side filtering
  const filteredFeed = useMemo(() =>
    feedItems.filter((item) => {
      if (filter === 'tracked') return item.trackedPostId !== null
      if (filter === 'untracked') return item.trackedPostId === null
      return true
    }),
    [feedItems, filter],
  )

  const filteredDbOnly = useMemo(() =>
    (filter === 'all' || filter === 'draft' || filter === 'failed')
      ? dbOnlyPosts.filter((p) => {
          if (filter === 'draft') return p.status === 'draft'
          if (filter === 'failed') return p.status === 'failed'
          return true
        })
      : [],
    [dbOnlyPosts, filter],
  )

  const showApiFeed = filter !== 'draft' && filter !== 'failed'

  const { totalTracked, totalUntracked, avgFavourites } = useMemo(() => ({
    totalTracked: feedItems.filter((i) => i.trackedPostId).length,
    totalUntracked: feedItems.filter((i) => !i.trackedPostId).length,
    avgFavourites: feedItems.length > 0
      ? Math.round(feedItems.reduce((sum, i) => sum + i.favouriteCount, 0) / feedItems.length)
      : 0,
  }), [feedItems])

  return (
    <>
      <Helmet>
        <title>Mastodon — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader
        title="Mastodon"
        description={feedItems.length > 0 ? `${feedItems.length} publicaciones cargadas` : undefined}
        actions={
          <Button variant="secondary" onClick={handleRefreshMetrics} loading={refreshing}>
            Actualizar métricas
          </Button>
        }
      />

      {/* Stats bar */}
      {feedQuery.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="rounded-md bg-white border border-neutral-200 p-3 text-center">
            <p className="text-2xl font-bold text-neutral-900">{feedItems.length}</p>
            <p className="text-xs text-neutral-500">Publicaciones cargadas</p>
          </div>
          <div className="rounded-md bg-white border border-neutral-200 p-3 text-center">
            <p className="text-2xl font-bold text-neutral-900">{totalTracked}</p>
            <p className="text-xs text-neutral-500">Rastreadas</p>
          </div>
          <div className="rounded-md bg-white border border-neutral-200 p-3 text-center">
            <p className="text-2xl font-bold text-neutral-900">{totalUntracked}</p>
            <p className="text-xs text-neutral-500">No rastreadas</p>
          </div>
          <div className="rounded-md bg-white border border-neutral-200 p-3 text-center">
            <p className="text-2xl font-bold text-neutral-900">{avgFavourites}</p>
            <p className="text-xs text-neutral-500">Favoritos promedio</p>
          </div>
        </div>
      )}

      {/* Filter buttons */}
      <div className="mb-4 flex gap-2">
        {([
          { value: 'all', label: 'Todos' },
          { value: 'tracked', label: 'Rastreados' },
          { value: 'untracked', label: 'No rastreados' },
          { value: 'draft', label: 'Borrador' },
          { value: 'failed', label: 'Fallido' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              filter === value
                ? 'bg-brand-100 text-brand-800 font-medium'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {feedQuery.isLoading && (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      )}

      {feedQuery.error && (
        <ErrorState message="Error al cargar el feed de Mastodon" onRetry={() => feedQuery.refetch()} />
      )}

      {/* Draft/Failed DB-only posts */}
      {filteredDbOnly.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-neutral-500 mb-2">
            {filter === 'draft' ? 'Borradores' : filter === 'failed' ? 'Fallidos' : 'Borradores y fallidos'}
          </h3>
          <div className="overflow-x-auto bg-white rounded-lg border border-neutral-200 shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th scope="col" className="text-left px-3 py-2 font-medium text-neutral-500">Texto</th>
                  <th scope="col" className="text-left px-3 py-2 font-medium text-neutral-500">Noticia</th>
                  <th scope="col" className="text-left px-3 py-2 font-medium text-neutral-500">Estado</th>
                  <th scope="col" className="text-left px-3 py-2 font-medium text-neutral-500">Creado</th>
                  <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredDbOnly.map((post) => (
                  <tr key={post.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-3 py-2 max-w-[300px]">
                      <p className="text-neutral-700 truncate">{post.postText}</p>
                      {post.error && (
                        <p className="text-xs text-red-600 truncate mt-0.5" title={post.error}>{post.error}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      {post.storyTitle ? (
                        <>
                          <p className="font-medium text-neutral-900 truncate">{post.storyTitle}</p>
                          {post.issueName && <p className="text-xs text-neutral-500">{post.issueName}</p>}
                        </>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[post.status as MastodonPostStatus] || 'bg-neutral-100 text-neutral-800'}`}>
                        {post.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-500 whitespace-nowrap">
                      {formatRelativeTime(post.createdAt)}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <ActionIconButton
                        icon={TrashIcon}
                        label="Delete"
                        variant="danger"
                        onClick={() => handleDelete(post.id)}
                        disabled={deletingId === post.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main feed table (API-sourced) */}
      {feedQuery.data && showApiFeed && filteredFeed.length === 0 && filteredDbOnly.length === 0 && (
        <EmptyState
          title="Sin publicaciones en Mastodon"
          description={
            filter === 'tracked'
              ? 'No se encontraron publicaciones rastreadas. Usa la página de Noticias para crear una publicación en Mastodon.'
              : filter === 'untracked'
              ? 'No se encontraron publicaciones no rastreadas.'
              : 'Sin publicaciones aún.'
          }
        />
      )}

      {showApiFeed && filteredFeed.length > 0 && (
        <>
          <div className="overflow-x-auto bg-white rounded-lg border border-neutral-200 shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th scope="col" className="text-left px-3 py-2 font-medium text-neutral-500">Texto</th>
                  <th scope="col" className="text-left px-3 py-2 font-medium text-neutral-500">Origen</th>
                  <th scope="col" className="hidden md:table-cell text-left px-3 py-2 font-medium text-neutral-500">Publicado</th>
                  <th scope="col" className="hidden lg:table-cell text-right px-3 py-2 font-medium text-neutral-500">Interacción</th>
                  <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredFeed.map((item) => {
                  const isExpanded = expandedId === item.id
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-neutral-100 last:border-0 group cursor-pointer ${isExpanded ? 'bg-neutral-50' : 'hover:bg-neutral-50'}`}
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <td className="px-3 py-2 max-w-[350px]">
                        {isExpanded ? (
                          <div className="text-neutral-700 whitespace-pre-wrap">{item.text}</div>
                        ) : (
                          <p className="text-neutral-700 truncate">{item.text}</p>
                        )}
                        {item.storyTitle && (
                          <p className="text-xs text-neutral-500 mt-0.5 truncate">
                            {item.storyTitle}
                            {item.issueName && <span className="text-neutral-400"> / {item.issueName}</span>}
                          </p>
                        )}
                        {item.isReblog && (
                          <span className="inline-flex items-center gap-1 text-xs text-neutral-400 mt-0.5">
                            <ArrowPathIcon className="h-3 w-3" /> Reblog
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {item.trackedPostId ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Rastreado
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">No rastreado</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-3 py-2 text-neutral-500 whitespace-nowrap">
                        {formatRelativeTime(item.createdAt)}
                      </td>
                      <td className="hidden lg:table-cell px-3 py-2 text-right text-neutral-500 whitespace-nowrap tabular-nums">
                        {`${item.favouriteCount}F ${item.boostCount}B ${item.replyCount}R`}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Ver en Mastodon"
                              aria-label="View on Mastodon"
                              className="rounded p-1 text-neutral-400 hover:text-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                            </a>
                          )}
                          {item.trackedPostId && (
                            <ActionIconButton
                              icon={TrashIcon}
                              label="Delete"
                              variant="danger"
                              onClick={() => handleDelete(item.trackedPostId!)}
                              disabled={deletingId === item.trackedPostId}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Load More */}
          {nextMaxId && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                onClick={handleLoadMore}
                loading={loadingMore}
              >
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
