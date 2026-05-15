import React, { useState } from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import FeedScreen from '../(app)/index'
import { ThemeProvider } from '../../src/context/ThemeContext'
import { DrawerContext } from '../../src/context/DrawerContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockRecipes = [
  { id: 'r1', slug: 'pasta-r1', title: 'Pasta', category: 'Hauptspeisen', image_filename: null, source_url: null, source_label: null, rating: 0, tags: [], created_at: '2024-01-01' },
  { id: 'r2', slug: 'salad-r2', title: 'Salad', category: 'Vorspeisen', image_filename: null, source_url: null, source_label: null, rating: 1, tags: ['Vegan'], created_at: '2024-01-02' },
]

const mockFetchNextPage = jest.fn()
const mockUseInfiniteRecipes = jest.fn()

jest.mock('../../src/hooks/useInfiniteRecipes', () => ({
  useInfiniteRecipes: (...args: unknown[]) => mockUseInfiniteRecipes(...args),
}))

jest.mock('../../src/hooks/useCategories', () => ({
  useCategories: jest.fn().mockReturnValue({
    data: ['Vorspeisen', 'Hauptspeisen', 'Desserts'],
    isLoading: false,
  }),
  useCategoryCounts: jest.fn().mockReturnValue({
    data: { counts: { Vorspeisen: 1, Hauptspeisen: 1, Desserts: 0 } },
    isLoading: false,
  }),
}))

jest.mock('@miximixi/shared/api', () => ({
  getTags: jest.fn().mockResolvedValue(['Vegan', 'Glutenfrei']),
  getHeroRecipes: jest.fn().mockResolvedValue([]),
  getImageUrl: (id: string) => `https://api.test/images/${id}`,
}))

// Wrapper with controllable drawer state — hamburger lives in the Tabs header
// (in _layout.tsx), so tests open the drawer via DrawerContext directly
function makeWrapper(initialDrawerOpen = false) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(initialDrawerOpen)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return (
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <DrawerContext.Provider value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
            {children}
          </DrawerContext.Provider>
        </ThemeProvider>
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseInfiniteRecipes.mockReturnValue({
    data: { pages: [mockRecipes] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isError: false,
    fetchNextPage: mockFetchNextPage,
  })
})

describe('FeedScreen', () => {
  test('renders recipe grid', () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper() })
    expect(getByTestId('recipe-grid')).toBeTruthy()
  })

  test('renders all recipe cards', () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper() })
    expect(getByTestId('recipe-card-r1')).toBeTruthy()
    expect(getByTestId('recipe-card-r2')).toBeTruthy()
  })

  test('renders search input', () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper() })
    expect(getByTestId('search-input')).toBeTruthy()
  })

  test('renders favorites toggle', async () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper() })
    await waitFor(() => expect(getByTestId('favorites-toggle')).toBeTruthy())
  })

  test('drawer shows category items when open', async () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper(true) })
    await waitFor(() => expect(getByTestId('category-item-all')).toBeTruthy())
    expect(getByTestId('category-item-vorspeisen')).toBeTruthy()
    expect(getByTestId('category-item-hauptspeisen')).toBeTruthy()
  })

  test('searching updates the query filter', async () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper() })
    fireEvent.changeText(getByTestId('search-input'), 'pasta')
    await waitFor(() => {
      const lastCall = mockUseInfiniteRecipes.mock.calls[mockUseInfiniteRecipes.mock.calls.length - 1]
      expect(lastCall[0].q).toBe('pasta')
    })
  })

  test('selecting a category from drawer updates the filter', async () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper(true) })
    await waitFor(() => getByTestId('category-item-hauptspeisen'))
    fireEvent.press(getByTestId('category-item-hauptspeisen'))
    await waitFor(() => {
      const lastCall = mockUseInfiniteRecipes.mock.calls[mockUseInfiniteRecipes.mock.calls.length - 1]
      expect(lastCall[0].category).toBe('Hauptspeisen')
    })
  })

  test('favorites toggle sets favorites filter', async () => {
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper() })
    await waitFor(() => getByTestId('favorites-toggle'))
    fireEvent.press(getByTestId('favorites-toggle'))
    await waitFor(() => {
      const lastCall = mockUseInfiniteRecipes.mock.calls[mockUseInfiniteRecipes.mock.calls.length - 1]
      expect(lastCall[0].favorites).toBe(true)
    })
  })

  test('infinite scroll sentinel triggers fetchNextPage', async () => {
    mockUseInfiniteRecipes.mockReturnValue({
      data: { pages: [mockRecipes] },
      hasNextPage: true,
      isFetchingNextPage: false,
      isLoading: false,
      isError: false,
      fetchNextPage: mockFetchNextPage,
    })
    const { getByTestId } = render(<FeedScreen />, { wrapper: makeWrapper() })
    fireEvent(getByTestId('recipe-grid'), 'endReached')
    expect(mockFetchNextPage).toHaveBeenCalled()
  })
})
