import { useQuery } from '@tanstack/react-query'
import { getDensities } from '@miximixi/shared/api'
import type { DensityType } from '@miximixi/shared/cupConversions'

export function useDensities() {
  return useQuery<DensityType[]>({
    queryKey: ['densities'],
    queryFn: getDensities,
    staleTime: Infinity,
    placeholderData: () => [],
  })
}
