import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useInfiniteRecipes } from '../hooks/useInfiniteRecipes'
import { useCategories, useCategoryCounts } from '../hooks/useCategories'
import { useDensities } from '../hooks/useDensities'

const mockRecipes = [
  { id: 'r1', title: 'Pasta', slug: 'pasta-r1', category: 'Hauptspeisen', image_filename: null, source_url: null, source_label: null, rating: 0, tags: [], created_at: '2024-01-01' },
]

const mockGetRecipes = jest.fn().mockResolvedValue(mockRecipes)
const mockGetCategories = jest.fn().mockResolvedValue(['Vorspeisen', 'Hauptspeisen'])
const mockGetCategoryCounts = jest.fn().mockResolvedValue({ counts: { Vorspeisen: 5 }, total: 5 })
const mockGetDensities = jest.fn().mockResolvedValue([{ type_name: 'flour', display_name: 'Flour', density_g_per_ml: 0.56, keywords: ['flour'] }])

jest.mock('@miximixi/shared/api', () => ({
  getRecipes: (...args: unknown[]) => mockGetRecipes(...args),
  getCategories: () => mockGetCategories(),
  getCategoryCounts: () => mockGetCategoryCounts(),
  getDensities: () => mockGetDensities(),
}))

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useInfiniteRecipes', () => {
  beforeEach(() => mockGetRecipes.mockClear())

  test('fetches first page on mount', async () => {
    const { result } = renderHook(() => useInfiniteRecipes(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.pages[0]).toEqual(mockRecipes)
    expect(mockGetRecipes).toHaveBeenCalledWith(20, 0, {})
  })

  test('passes search query filter', async () => {
    const { result } = renderHook(
      () => useInfiniteRecipes({ q: 'pasta' }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(mockGetRecipes).toHaveBeenCalledWith(20, 0, { q: 'pasta' })
  })

  test('passes category filter', async () => {
    const { result } = renderHook(
      () => useInfiniteRecipes({ category: 'Desserts' }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(mockGetRecipes).toHaveBeenCalledWith(20, 0, { category: 'Desserts' })
  })

  test('passes tags filter', async () => {
    const { result } = renderHook(
      () => useInfiniteRecipes({ tags: ['Vegan', 'Glutenfrei'] }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(mockGetRecipes).toHaveBeenCalledWith(20, 0, { tags: ['Vegan', 'Glutenfrei'] })
  })

  test('passes favorites filter', async () => {
    const { result } = renderHook(
      () => useInfiniteRecipes({ favorites: true }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(mockGetRecipes).toHaveBeenCalledWith(20, 0, { favorites: true })
  })

  test('hasNextPage is true when full page returned', async () => {
    const fullPage = Array.from({ length: 20 }, (_, i) => ({ ...mockRecipes[0], id: `r${i}` }))
    mockGetRecipes.mockResolvedValueOnce(fullPage)
    const { result } = renderHook(() => useInfiniteRecipes(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.hasNextPage).toBe(true)
  })

  test('hasNextPage is false when partial page returned', async () => {
    mockGetRecipes.mockResolvedValueOnce(mockRecipes) // less than 20
    const { result } = renderHook(() => useInfiniteRecipes(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.hasNextPage).toBe(false)
  })
})

describe('useCategories', () => {
  test('fetches and returns category list', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(['Vorspeisen', 'Hauptspeisen'])
  })
})

describe('useCategoryCounts', () => {
  test('fetches and returns counts', async () => {
    const { result } = renderHook(() => useCategoryCounts(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.total).toBe(5)
  })
})

describe('useDensities', () => {
  test('fetches and returns density list', async () => {
    const { result } = renderHook(() => useDensities(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0].type_name).toBe('flour')
  })

  test('returns empty array as initial data', () => {
    const { result } = renderHook(() => useDensities(), { wrapper: makeWrapper() })
    // Before query resolves, initialData is []
    expect(result.current.data).toEqual([])
  })
})
