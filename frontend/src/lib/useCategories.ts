import { useQuery } from '@tanstack/react-query'
import { getCategories, getCategoryCounts } from './api'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 1000 * 60 * 60, // 1 Stunde
  })
}

export function useCategoryCounts() {
  return useQuery({
    queryKey: ['categoryCounts'],
    queryFn: getCategoryCounts,
    staleTime: 1000 * 60 * 60,
  })
}
