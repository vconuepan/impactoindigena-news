import { useQuery } from '@tanstack/react-query'
import { publicApi } from '../lib/api'

export function usePublicStories(params?: {
  page?: number
  pageSize?: number
  issueSlug?: string
  search?: string
  emotionTags?: string
  dateFrom?: string
  dateTo?: string
}) {
  return useQuery({
    queryKey: ['public-stories', params],
    queryFn: () => publicApi.stories.list(params),
  })
}

export function usePublicStory(slug: string) {
  return useQuery({
    queryKey: ['public-story', slug],
    queryFn: () => publicApi.stories.get(slug),
    enabled: !!slug,
  })
}

export function useRelatedStories(slug: string | undefined) {
  return useQuery({
    queryKey: ['related-stories', slug],
    queryFn: () => publicApi.stories.related(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}

export function useClusterMembers(slug: string | undefined) {
  return useQuery({
    queryKey: ['cluster-members', slug],
    queryFn: () => publicApi.stories.cluster(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
