import { useQuery } from '@tanstack/react-query'
import { publicApi } from '../lib/api'

export function useAgenda() {
  return useQuery({
    queryKey: ['agenda'],
    queryFn: () => publicApi.agenda(),
    staleTime: 5 * 60 * 1000,
  })
}
