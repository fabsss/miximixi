import { useQuery } from '@tanstack/react-query'
import { getCategories, getCategoryCounts } from '@miximixi/shared/api'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 1000 * 60 * 60,
  })
}

export function useCategoryCounts() {
  return useQuery({
    queryKey: ['categoryCounts'],
    queryFn: getCategoryCounts,
    staleTime: 1000 * 60 * 60,
  })
}
