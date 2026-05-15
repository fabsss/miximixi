import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import RecipeDetailScreen from '../(app)/recipe/[id]'
import { ThemeProvider } from '../../src/context/ThemeContext'
import { TimerProvider } from '../../src/context/TimerContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'

const mockRecipe = {
  id: 'r1',
  slug: 'pasta-r1',
  title: 'Creamy Pasta',
  category: 'Hauptspeisen',
  image_filename: null,
  source_url: null,
  source_label: null,
  rating: 0,
  tags: ['Italian'],
  created_at: '2024-01-01',
  lang: 'de',
  servings: 4,
  prep_time: '10 min',
  cook_time: '20 min',
  notes: 'Delicious!',
  ingredients: [
    { id: 'i1', recipe_id: 'r1', sort_order: 0, name: 'Pasta', amount: 200, unit: 'g', group_name: null, section: null },
    { id: 'i2', recipe_id: 'r1', sort_order: 1, name: 'Cream', amount: 100, unit: 'ml', group_name: null, section: null },
  ],
  steps: [
    { id: 's1', recipe_id: 'r1', sort_order: 0, text: 'Boil water and cook pasta.', time_minutes: 10, step_image_filename: null },
    { id: 's2', recipe_id: 'r1', sort_order: 1, text: 'Add cream and mix.', time_minutes: null, step_image_filename: null },
  ],
}

const mockGetRecipe = jest.fn()
const mockUpdateRecipe = jest.fn()
const mockDeleteRecipe = jest.fn()
const mockTranslateRecipe = jest.fn()

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'r1' }),
  router: { push: jest.fn(), back: jest.fn() },
}))

jest.mock('@miximixi/shared/api', () => ({
  getRecipe: (...args: unknown[]) => mockGetRecipe(...args),
  updateRecipe: (...args: unknown[]) => mockUpdateRecipe(...args),
  deleteRecipe: (...args: unknown[]) => mockDeleteRecipe(...args),
  translateRecipe: (...args: unknown[]) => mockTranslateRecipe(...args),
  getImageUrl: (id: string) => `https://api.test/images/${id}`,
  getStepImageUrl: (id: string, f: string) => `https://api.test/images/${id}/${f}`,
}))

jest.mock('../../src/hooks/useDensities', () => ({
  useDensities: () => ({ data: [] }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <TimerProvider>{children}</TimerProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
  mockGetRecipe.mockResolvedValue(mockRecipe)
  mockUpdateRecipe.mockResolvedValue(mockRecipe)
  mockDeleteRecipe.mockResolvedValue(undefined)
  mockTranslateRecipe.mockResolvedValue({ title: 'Pasta', ingredients: [], steps: [] })
})

describe('RecipeDetailScreen', () => {
  test('renders recipe title', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('recipe-title')).toBeTruthy())
    expect(getByTestId('recipe-title').props.children).toBe('Creamy Pasta')
  })

  test('renders all ingredient rows', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => {
      expect(getByTestId('ingredient-i1')).toBeTruthy()
      expect(getByTestId('ingredient-i2')).toBeTruthy()
    })
  })

  test('renders all step cards', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => {
      expect(getByTestId('step-card-0')).toBeTruthy()
      expect(getByTestId('step-card-1')).toBeTruthy()
    })
  })

  test('renders step timer for step with time', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('step-timer-0')).toBeTruthy())
  })

  test('cook button navigates to cook screen', async () => {
    const { router } = require('expo-router')
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => getByTestId('cook-button'))
    fireEvent.press(getByTestId('cook-button'))
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('cook'))
  })

  test('delete button shows confirmation alert', async () => {
    const { Alert } = require('react-native')
    const alertSpy = jest.spyOn(Alert, 'alert')
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => getByTestId('delete-button'))
    fireEvent.press(getByTestId('delete-button'))
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Recipe',
      expect.any(String),
      expect.any(Array),
    )
  })

  test('edit button shows edit form', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => getByTestId('edit-button'))
    fireEvent.press(getByTestId('edit-button'))
    await waitFor(() => expect(getByTestId('title-input')).toBeTruthy())
  })

  test('scaling slider is rendered when servings > 0', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('scaling-slider')).toBeTruthy())
  })

  test('heart toggle button is rendered', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('rating-1')).toBeTruthy())
  })
})
