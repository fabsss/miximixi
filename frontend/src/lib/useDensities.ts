import { useQuery } from '@tanstack/react-query'
import { getDensities } from './api'
import type { DensityType } from './cupConversions'

export function useDensities() {
  return useQuery<DensityType[]>({
    queryKey: ['densities'],
    queryFn: getDensities,
    staleTime: Infinity,
    fallbackData: [],
  })
}
