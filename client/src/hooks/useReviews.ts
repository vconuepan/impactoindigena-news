import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type ReviewCode, type ReviewDecision, type ReviewMode, type ReviewState } from '../lib/admin-api'

/** Revisión por marca (retención por vertical, D4). */

export function useReviewVerticals() {
  return useQuery({ queryKey: ['admin', 'reviews'], queryFn: () => adminApi.reviews.verticals() })
}

export function useReviewQueue(slug: string | null, params: { state?: ReviewState; page: number; pageSize: number }) {
  return useQuery({
    queryKey: ['admin', 'reviews', slug, params],
    queryFn: () => adminApi.reviews.queue(slug!, params),
    enabled: !!slug,
    placeholderData: (prev) => prev,
  })
}

function invalidar(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] })
  queryClient.invalidateQueries({ queryKey: ['admin', 'integration-health'] })
}

export function useDecideReview(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { storyId: string; decision: ReviewDecision; code?: ReviewCode; note?: string }) =>
      adminApi.reviews.decide(slug, body),
    onSuccess: () => invalidar(queryClient),
  })
}

export function useBulkDecideReview(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { storyIds: string[]; decision: ReviewDecision; code?: ReviewCode; note?: string }) =>
      adminApi.reviews.bulkDecide(slug, body),
    onSuccess: () => invalidar(queryClient),
  })
}

export function useReviewModePreview(slug: string | null, mode: ReviewMode | null) {
  return useQuery({
    queryKey: ['admin', 'reviews', slug, 'mode-preview', mode],
    queryFn: () => adminApi.reviews.modePreview(slug!, mode!),
    enabled: !!slug && !!mode,
  })
}

export function useSetReviewMode(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mode: ReviewMode) => adminApi.reviews.setMode(slug, mode),
    onSuccess: () => invalidar(queryClient),
  })
}
