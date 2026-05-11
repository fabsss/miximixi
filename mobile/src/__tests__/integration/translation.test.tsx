import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import RecipeDetailScreen from '../../../app/(app)/recipe/[id]'
import { ThemeProvider } from '../../context/ThemeContext'
import { TimerProvider } from '../../context/TimerContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'

const mockRecipe = {
  id: 'r1',
  slug: 'pasta-r1',
  title: 'Nudeln mit Sahnesoße',
  category: 'Hauptspeisen',
  image_filename: null,
  source_url: null,
  source_label: null,
  rating: 0,
  tags: [],
  created_at: '2024-01-01',
  lang: 'de',
  servings: 4,
  prep_time: '10 min',
  cook_time: '20 min',
  notes: null,
  ingredients: [
    { id: 'i1', recipe_id: 'r1', sort_order: 0, name: 'Nudeln', amount: 200, unit: 'g', group_name: null, section: null },
  ],
  steps: [
    { id: 's1', recipe_id: 'r1', sort_order: 0, text: 'Wasser kochen', time_minutes: null, step_image_filename: null },
  ],
}

const mockTranslationResult = {
  title: 'Pasta with Cream Sauce',
  ingredients: [{ id: 'i1', name: 'Pasta' }],
  steps: [{ id: 's1', text: 'Boil water' }],
}

const mockTranslate = jest.fn().mockResolvedValue(mockTranslationResult)
const mockGetRecipe = jest.fn().mockResolvedValue(mockRecipe)

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'r1' }),
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}))

jest.mock('@miximixi/shared/api', () => ({
  getRecipe: (...args: unknown[]) => mockGetRecipe(...args),
  translateRecipe: (...args: unknown[]) => mockTranslate(...args),
  updateRecipe: jest.fn(),
  deleteRecipe: jest.fn(),
  getImageUrl: (id: string) => `https://api.test/images/${id}`,
  getStepImageUrl: (id: string, f: string) => `https://api.test/images/${id}/${f}`,
}))

jest.mock('../../hooks/useDensities', () => ({
  useDensities: () => ({ data: [] }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <TimerProvider>{children}</TimerProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
})

describe('Translation integration', () => {
  test('translate button triggers POST to /translate', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => getByTestId('translate-en'))
    await act(async () => { fireEvent.press(getByTestId('translate-en')) })
    await waitFor(() => expect(mockTranslate).toHaveBeenCalledWith('r1', 'en'))
  })

  test('translated title replaces original in UI', async () => {
    const { getByTestId, getByText } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => getByTestId('recipe-title'))
    expect(getByText('Nudeln mit Sahnesoße')).toBeTruthy()

    await act(async () => { fireEvent.press(getByTestId('translate-en')) })
    await waitFor(() => expect(getByText('Pasta with Cream Sauce')).toBeTruthy())
  })

  test('translated ingredient names replace originals in UI', async () => {
    const { getByTestId, queryByText, getByText } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => getByTestId('ingredient-i1'))
    expect(getByText('Nudeln')).toBeTruthy()

    await act(async () => { fireEvent.press(getByTestId('translate-en')) })
    await waitFor(() => expect(getByText('Pasta')).toBeTruthy())
    expect(queryByText('Nudeln')).toBeNull()
  })

  test('translated step text replaces original in UI', async () => {
    const { getByTestId, getByText, queryByText } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => getByTestId('step-card-0'))
    expect(getByText('Wasser kochen')).toBeTruthy()

    await act(async () => { fireEvent.press(getByTestId('translate-en')) })
    await waitFor(() => expect(getByText('Boil water')).toBeTruthy())
    expect(queryByText('Wasser kochen')).toBeNull()
  })

  test('different language codes call translate with that code', async () => {
    const { getByTestId } = render(<RecipeDetailScreen />, { wrapper })
    await waitFor(() => getByTestId('translate-fr'))
    await act(async () => { fireEvent.press(getByTestId('translate-fr')) })
    await waitFor(() => expect(mockTranslate).toHaveBeenCalledWith('r1', 'fr'))
  })
})
