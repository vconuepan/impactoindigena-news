/**
 * SpotlightBand — "En Foco" rotating headline band.
 *
 * Sits between the hero and the issue feed on the homepage.
 * Shows the active spotlight label + up to 8 matching story headlines,
 * cycling through them with a smooth fade every 5 seconds.
 *
 * Renders nothing when there is no active spotlight or no matching stories.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { publicApi } from '../lib/api'
import type { SpotlightStory } from '../lib/api'
import { getCategoryColor } from '../lib/category-colors'

const ROTATION_INTERVAL = 5000 // ms between story transitions

export default function SpotlightBand() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['spotlight'],
    queryFn: () => publicApi.spotlight(),
    staleTime: 2 * 60 * 1000,
  })

  const [activeIdx, setActiveIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stories: SpotlightStory[] = data?.stories ?? []
  const total = stories.length

  // Reset index when stories change
  useEffect(() => {
    setActiveIdx(0)
    setVisible(true)
  }, [data?.spotlight?.id])

  // Auto-rotate with fade
  useEffect(() => {
    if (total <= 1) return

    timerRef.current = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setActiveIdx((prev) => (prev + 1) % total)
        setVisible(true)
      }, 350)
    }, ROTATION_INTERVAL)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [total, data?.spotlight?.id])

  // Manual dot navigation
  function goTo(idx: number) {
    if (timerRef.current) clearInterval(timerRef.current)
    setVisible(false)
    setTimeout(() => {
      setActiveIdx(idx)
      setVisible(true)
    }, 200)
  }

  if (isLoading || !data || total === 0) return null

  const { spotlight } = data
  const story = stories[activeIdx]
  const issueColor = story.issue ? getCategoryColor(story.issue.slug) : null

  return (
    <div
      className="w-full border-b border-neutral-800/60"
      style={{
        background: 'linear-gradient(180deg, #0f0f0e 0%, #1a1917 100%)',
      }}
      role="region"
      aria-label={`${t('spotlight.label')}: ${spotlight.label}`}
    >
      <div className="max-w-5xl mx-auto px-4 py-4 md:py-5">
        <div className="flex items-start gap-4 md:gap-5 min-h-[3.5rem]">
          {/* Label pill */}
          <div className="shrink-0 pt-0.5">
            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap font-dm-sans"
              style={{ color: '#4ade80' }}
            >
              <span className="inline-flex rounded-full h-2 w-2 bg-green-400 shrink-0" aria-hidden="true" />
              {t('spotlight.label')}
            </span>
            <p className="text-xs text-neutral-500 font-medium mt-1 leading-tight max-w-[130px] md:max-w-none font-dm-sans">
              {spotlight.label}
            </p>
          </div>

          {/* Divider */}
          <div
            className="w-px self-stretch shrink-0 mt-0.5"
            style={{ background: 'linear-gradient(180deg, transparent, #3d3836 30%, #3d3836 70%, transparent)' }}
            aria-hidden="true"
          />

          {/* Rotating headline */}
          <div className="flex-1 min-w-0">
            <div
              className="transition-all duration-300 ease-out"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(4px)',
              }}
              aria-live="polite"
              aria-atomic="true"
            >
              {story.issue && (
                <span
                  className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1 font-dm-sans"
                  style={{ color: issueColor?.hex ?? '#a1a1aa' }}
                >
                  {story.issue.name}
                </span>
              )}
              {story.slug ? (
                <Link
                  to={`/stories/${story.slug}`}
                  className="block text-[15px] md:text-base font-semibold leading-snug line-clamp-2 transition-colors duration-150 font-fraunces text-[#FAFAF8] hover:text-brand-300"
                >
                  {story.title}
                </Link>
              ) : (
                <p className="text-[15px] md:text-base font-semibold leading-snug line-clamp-2 font-fraunces" style={{ color: '#FAFAF8' }}>
                  {story.title}
                </p>
              )}
            </div>
          </div>

          {/* Dot navigation — 44px touch targets */}
          {total > 1 && (
            <nav className="hidden lg:flex shrink-0 items-center gap-0.5 self-start pt-1" aria-label="Navegación de titulares">
              {stories.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  aria-label={t('spotlight.dotNavLabel', { current: idx + 1, total })}
                  aria-current={idx === activeIdx ? 'step' : undefined}
                  className="relative flex items-center justify-center w-7 h-7 focus-visible:ring-2 focus-visible:ring-brand-400 rounded-full"
                >
                  <span
                    className="block rounded-full transition-all duration-200"
                    style={{
                      width: idx === activeIdx ? 8 : 5,
                      height: idx === activeIdx ? 8 : 5,
                      backgroundColor: idx === activeIdx ? '#4ade80' : '#525252',
                      boxShadow: idx === activeIdx ? '0 0 8px rgba(74, 222, 128, 0.4)' : 'none',
                    }}
                  />
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
