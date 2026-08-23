import { useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { publicApi } from '../lib/api'
import { formatRelativeTime } from '../lib/constants'

export default function EmbedPage() {
  const [params] = useSearchParams()
  const count = Math.min(5, Math.max(1, parseInt(params.get('count') || '3', 10) || 3))
  const issue = params.get('issue') || undefined
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
  const showSummary = params.get('summary') === 'true'
  const mood = params.get('mood') || ''
  const containerRef = useRef<HTMLDivElement>(null)

  const emotionTags = mood === 'uplifting' ? 'uplifting' : undefined

  const { data, isLoading, isError } = useQuery({
    queryKey: ['embed-stories', issue, count, mood],
    queryFn: () => publicApi.stories.list({ page: 1, pageSize: count, issueSlug: issue, emotionTags }),
  })

  // Post height to parent for auto-resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        window.parent.postMessage(
          { type: 'ar-embed-resize', height: containerRef.current.scrollHeight },
          '*',
        )
      }
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const isDark = theme === 'dark'

  // Set html/body background to match theme so iframe has no white gap
  useEffect(() => {
    const bg = isDark ? '#171717' : '#ffffff' // neutral-900 / white
    document.documentElement.style.background = bg
    document.body.style.background = bg
    return () => {
      document.documentElement.style.background = ''
      document.body.style.background = ''
    }
  }, [isDark])

  return (
    <main
      ref={containerRef}
      className={`font-sans text-sm leading-relaxed ${isDark ? 'bg-neutral-900 text-neutral-200' : 'bg-white text-neutral-700'}`}
    >
      <h1 className="sr-only">Voces Indígenas Stories</h1>
      {isLoading && (
        <div className={`px-4 py-8 text-center text-[13px] ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
          Loading...
        </div>
      )}

      {isError && (
        <div className="px-4 py-8 text-center text-[13px] text-red-500">
          Could not load stories
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className={`px-4 py-8 text-center text-[13px] ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
          No stories available
        </div>
      )}

      {data && data.data.length > 0 && (
        <ul className={`divide-y ${isDark ? 'divide-neutral-700' : 'divide-neutral-200'}`}>
          {data.data.map((story) => (
            <li key={story.id}>
              <Link
                to={`/stories/${story.slug || story.id}`}
                target="_blank"
                className={`block px-4 py-2.5 transition-colors ${isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-50'}`}
              >
                <p className="font-medium text-[14px] mb-0.5">
                  {story.titleLabel ? `${story.titleLabel}: ` : ''}{story.title || story.sourceTitle}
                </p>
                {showSummary && story.relevanceSummary && (
                  <p className={`text-[12px] leading-relaxed mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    {story.relevanceSummary}
                  </p>
                )}
                <span className={`text-[12px] ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  {story.feed?.displayTitle || story.feed?.title}
                  {story.datePublished && ` \u00b7 ${formatRelativeTime(story.datePublished)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className={`px-4 py-2 border-t flex items-center justify-center ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}>
        <a
          href="https://vocesindigenas.org"
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 text-[11px] ${isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-700'}`}
        >
          <img
            src="https://vocesindigenas.org/images/logo-no-text-square.png"
            alt=""
            className="w-5 h-5 rounded-sm"
            aria-hidden="true"
          />
          Powered by Voces Indígenas
        </a>
      </div>
    </main>
  )
}
