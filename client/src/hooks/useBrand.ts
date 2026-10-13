import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type ReviewMode } from '../lib/admin-api'

/** Criterio por marca (D5). */

export function useBrandPanels() {
  return useQuery({ queryKey: ['admin', 'brand'], queryFn: () => adminApi.brand.panels() })
}

export function useBrandSelections(slug: string | null) {
  return useQuery({
    queryKey: ['admin', 'brand', slug, 'elegidas'],
    queryFn: () => adminApi.brand.elegidas(slug!),
    enabled: !!slug,
  })
}

export function useSetBrandMode(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { mode?: ReviewMode; rescueMode?: ReviewMode }) => adminApi.brand.setMode(slug, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'brand'] }),
  })
}
