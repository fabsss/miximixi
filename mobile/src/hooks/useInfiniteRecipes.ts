import { useInfiniteQuery } from '@tanstack/react-query'
import { getRecipes, type GetRecipesFilters } from '@miximixi/shared/api'
import { PAGE_SIZE } from '@miximixi/shared/constants'

export function useInfiniteRecipes(filters: GetRecipesFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['recipes', filters],
    queryFn: ({ pageParam = 0 }) => getRecipes(PAGE_SIZE, pageParam as number, filters),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined
      return allPages.length * PAGE_SIZE
    },
    initialPageParam: 0,
    staleTime: 30_000,
  })
}
