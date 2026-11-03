import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FunnelIcon } from '@heroicons/react/24/outline'
import { STORY_STATUSES, EMOTION_TAGS } from '@shared/constants'
import { Select } from '../ui/Select'
import { formatStatus } from '../../lib/constants'
import type { Issue, Feed } from '@shared/types'

/** Build a flat options list with children indented under their parent. */
export function buildIssueOptions(issues: Issue[]): { value: string; label: string }[] {
  const parents = issues.filter(i => !i.parentId).sort((a, b) => a.name.localeCompare(b.name))
  const childrenByParent = new Map<string, Issue[]>()
  for (const issue of issues) {
    if (issue.parentId) {
      const list = childrenByParent.get(issue.parentId) || []
      list.push(issue)
      childrenByParent.set(issue.parentId, list)
    }
  }

  const options: { value: string; label: string }[] = []
  for (const parent of parents) {
    options.push({ value: parent.id, label: parent.name })
    const children = childrenByParent.get(parent.id) || []
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      options.push({ value: child.id, label: `└ ${child.name}` })
    }
  }
  return options
}

interface StoryFiltersBarProps {
  issues: Issue[]
  feeds: Feed[]
}

export function StoryFiltersBar({ issues, feeds }: StoryFiltersBarProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [expanded, setExpanded] = useState(false)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync input if URL param changes externally
  useEffect(() => {
    setSearchInput(searchParams.get('search') || '')
  }, [searchParams.get('search')])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      if (value.trim()) {
        next.set('search', value.trim())
      } else {
        next.delete('search')
      }
      next.delete('page')
      setSearchParams(next)
    }, 400)
  }

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    // Reset to page 1 on filter change
    next.delete('page')
    setSearchParams(next)
  }

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: currentYear - 2019 }, (_, i) => {
    const y = currentYear - i
    return { value: String(y), label: String(y) }
  })

  // Count active filters (excluding default sort)
  const activeCount = [
    searchParams.get('status'),
    searchParams.get('issueId'),
    searchParams.get('feedId'),
    searchParams.get('emotionTag'),
    searchParams.get('bodyMethod'),
    searchParams.get('rating'),
    searchParams.get('publishYear'),
    searchParams.get('search'),
  ].filter(Boolean).length

  return (
    <div className="mb-4">
      {/* Search box — always visible */}
      <div className="mb-3">
        <input
          type="search"
          placeholder="Search by title..."
          value={searchInput}
          onChange={e => handleSearchChange(e.target.value)}
          className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Mobile toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="md:hidden flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
      >
        <FunnelIcon className="h-4 w-4" />
        Filters{activeCount > 0 && ` (${activeCount})`}
        <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Filters — always visible on md+, toggleable on mobile */}
      <div className={`flex flex-wrap gap-3 ${expanded ? '' : 'hidden md:flex'}`}>
        <Select
          id="filter-status"
          label="Status"
          placeholder="All (excl. trashed)"
          value={searchParams.get('status') || ''}
          onChange={e => setFilter('status', e.target.value)}
          options={[
            ...STORY_STATUSES.map(s => ({ value: s, label: formatStatus(s) })),
            { value: 'all', label: 'All (incl. trashed)' },
          ]}
        />
        <Select
          id="filter-issue"
          label="Issue"
          placeholder="All issues"
          value={searchParams.get('issueId') || ''}
          onChange={e => setFilter('issueId', e.target.value)}
          options={buildIssueOptions(issues)}
        />
        <Select
          id="filter-feed"
          label="Feed"
          placeholder="All feeds"
          value={searchParams.get('feedId') || ''}
          onChange={e => setFilter('feedId', e.target.value)}
          options={(() => {
            const sorted = [...feeds].sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title))
            const active = sorted.filter(f => f.active)
            const inactive = sorted.filter(f => !f.active)
            return [
              ...active.map(f => ({ value: f.id, label: f.title })),
              ...(inactive.length ? [{ value: '', label: '── Inactive ──', disabled: true }] : []),
              ...inactive.map(f => ({ value: f.id, label: f.title })),
            ]
          })()}
        />
        <Select
          id="filter-rating"
          label="Rating"
          placeholder="Any rating"
          value={searchParams.get('rating') || ''}
          onChange={e => setFilter('rating', e.target.value)}
          options={[
            { value: 'gte4', label: '≥ 4' },
            { value: 'gte5', label: '≥ 5' },
            { value: 'gte6', label: '≥ 6' },
            { value: 'gte7', label: '≥ 7' },
            { value: 'lte3', label: '≤ 3' },
            { value: 'lte4', label: '≤ 4' },
            { value: 'lte5', label: '≤ 5' },
            { value: 'lte6', label: '≤ 6' },
            { value: 'lte7', label: '≤ 7' },
          ]}
        />
        <Select
          id="filter-emotion"
          label="Emotion"
          placeholder="All emotions"
          value={searchParams.get('emotionTag') || ''}
          onChange={e => setFilter('emotionTag', e.target.value)}
          options={EMOTION_TAGS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))}
        />
        {/* Las que esperan revisión no salen en la ficha pública (decisión C7, 3-nov-2026) */}
        <Select
          id="filter-body"
          label="Nota con claves"
          placeholder="Todas"
          value={searchParams.get('bodyMethod') || ''}
          onChange={e => setFilter('bodyMethod', e.target.value)}
          options={[
            { value: 'ia_sin_revision', label: 'Por revisar' },
            { value: 'ia_revisada', label: 'Revisada' },
            { value: 'humana', label: 'Escrita por una persona' },
          ]}
        />
        <Select
          id="filter-year"
          label="Año publicación"
          placeholder="Todos los años"
          value={searchParams.get('publishYear') || ''}
          onChange={e => setFilter('publishYear', e.target.value)}
          options={yearOptions}
        />
        <Select
          id="filter-sort"
          label="Sort"
          value={searchParams.get('sort') || 'date_desc'}
          onChange={e => setFilter('sort', e.target.value)}
          options={[
            { value: 'date_desc', label: 'Newest first' },
            { value: 'date_asc', label: 'Oldest first' },
            { value: 'rating_desc', label: 'Highest rating' },
            { value: 'rating_asc', label: 'Lowest rating' },
            { value: 'title_asc', label: 'Title A-Z' },
            { value: 'title_desc', label: 'Title Z-A' },
          ]}
        />
      </div>
    </div>
  )
}
