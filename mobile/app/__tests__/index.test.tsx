import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import FeedScreen from '../(app)/index'
import { ThemeProvider } from '../../src/context/ThemeContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockRecipes = [
  { id: 'r1', slug: 'pasta-r1', title: 'Pasta', category: 'Hauptspeisen', image_filename: null, source_url: null, source_label: null, rating: 0, tags: [], created_at: '2024-01-01' },
  { id: 'r2', slug: 'salad-r2', title: 'Salad', category: 'Vorspeisen', image_filename: null, source_url: null, source_label: null, rating: 1, tags: ['Vegan'], created_at: '2024-01-02' },
]

const mockFetchNextPage = jest.fn()
const mockHasNextPage = false

jest.mock('../../src/hooks/useInfiniteRecipes', () => ({
  useInfiniteRecipes: jest.fn().mockReturnValue({
    data: { pages: [mockRecipes] },
    hasNextPage: mockHasNextPage,
    isFetchingNextPage: false,
    isLoading: false,
    isError: false,
    fetchNextPage: mockFetchNextPage,
  }),
}))

jest.mock('../../src/hooks/useCategories', () => ({
  useCategories: jest.fn().mockReturnValue({
    data: ['Vorspeisen', 'Hauptspeisen', 'Desserts'],
    isLoading: false,
  }),
  useCategoryCounts: jest.fn().mockReturnValue({ data: {}, isLoading: false }),
}))

jest.mock('@miximixi/shared/api', () => ({
  getTags: jest.fn().mockResolvedValue(['Vegan', 'Glutenfrei']),
  getHeroRecipes: jest.fn().mockResolvedValue([]),
  getImageUrl: (id: string) => `https://api.test/images/${id}`,
}))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}

describe('FeedScreen', () => {
  test('renders recipe grid', () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper })
    expect(getByTestId('recipe-grid')).toBeTruthy()
  })

  test('renders all recipe cards', () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper })
    expect(getByTestId('recipe-card-r1')).toBeTruthy()
    expect(getByTestId('recipe-card-r2')).toBeTruthy()
  })

  test('renders search input', () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper })
    expect(getByTestId('search-input')).toBeTruthy()
  })

  test('renders category pills', async () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('category-pills')).toBeTruthy())
    expect(getByTestId('category-pill-all')).toBeTruthy()
    expect(getByTestId('category-pill-vorspeisen')).toBeTruthy()
  })

  test('renders favorites toggle', () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper })
    expect(getByTestId('favorites-toggle')).toBeTruthy()
  })

  test('searching updates the query filter', async () => {
    const { useInfiniteRecipes } = require('../../src/hooks/useInfiniteRecipes')
    const { getByTestId } = render(<FeedScreen />, { wrapper })
    fireEvent.changeText(getByTestId('search-input'), 'pasta')
    await waitFor(() => {
      const lastCall = useInfiniteRecipes.mock.calls[useInfiniteRecipes.mock.calls.length - 1]
      expect(lastCall[0].q).toBe('pasta')
    })
  })

  test('selecting a category updates the filter', async () => {
    const { useInfiniteRecipes } = require('../../src/hooks/useInfiniteRecipes')
    const { getByTestId } = render(<FeedScreen />, { wrapper })
    await waitFor(() => getByTestId('category-pill-hauptspeisen'))
    fireEvent.press(getByTestId('category-pill-hauptspeisen'))
    await waitFor(() => {
      const lastCall = useInfiniteRecipes.mock.calls[useInfiniteRecipes.mock.calls.length - 1]
      expect(lastCall[0].category).toBe('Hauptspeisen')
    })
  })

  test('favorites toggle sets favorites filter', async () => {
    const { useInfiniteRecipes } = require('../../src/hooks/useInfiniteRecipes')
    const { getByTestId } = render(<FeedScreen />, { wrapper })
    fireEvent.press(getByTestId('favorites-toggle'))
    await waitFor(() => {
      const lastCall = useInfiniteRecipes.mock.calls[useInfiniteRecipes.mock.calls.length - 1]
      expect(lastCall[0].favorites).toBe(true)
    })
  })
})
