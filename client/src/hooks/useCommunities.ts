import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { publicApi, memberAuth } from '../lib/api'

export function useCommunities() {
  return useQuery({
    queryKey: ['communities'],
    queryFn: () => publicApi.communities.list(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCommunity(slug: string) {
  return useQuery({
    queryKey: ['community', slug],
    queryFn: () => publicApi.communities.get(slug),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCommunityStories(slug: string, params?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['community-stories', slug, params],
    queryFn: () => publicApi.communities.stories(slug, params),
    enabled: !!slug,
  })
}

export function useMembership(slug: string) {
  return useQuery({
    queryKey: ['community-membership', slug],
    queryFn: () => publicApi.communities.membership(slug),
    enabled: !!slug && memberAuth.isAuthenticated(),
    retry: false,
  })
}

export function useJoinCommunity(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (consent?: boolean) => publicApi.communities.join(slug, consent),
    onSuccess: (_data, consent) => {
      queryClient.setQueryData(['community-membership', slug], { isMember: true, consented: consent === true })
    },
  })
}

export function useLeaveCommunity(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => publicApi.communities.leave(slug),
    onSuccess: () => {
      queryClient.setQueryData(['community-membership', slug], { isMember: false, consented: false })
    },
  })
}

export function useCommunitySignals(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ['community-signals', slug],
    queryFn: () => publicApi.communities.signals(slug),
    enabled: !!slug && enabled,
    staleTime: 60 * 60 * 1000, // 1h — matches server cache
    retry: false,
  })
}
