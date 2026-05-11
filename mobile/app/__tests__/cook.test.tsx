import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import CookScreen from '../(app)/cook/[id]'
import { ThemeProvider } from '../../src/context/ThemeContext'
import { TimerProvider } from '../../src/context/TimerContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as KeepAwake from 'expo-keep-awake'
import AsyncStorage from '@react-native-async-storage/async-storage'

const mockRecipe = {
  id: 'r1',
  slug: 'pasta-r1',
  title: 'Pasta',
  category: 'Hauptspeisen',
  image_filename: null,
  source_url: null,
  source_label: null,
  rating: 0,
  tags: [],
  created_at: '2024-01-01',
  lang: 'de',
  servings: 4,
  prep_time: null,
  cook_time: null,
  notes: null,
  ingredients: [],
  steps: [
    { id: 's1', recipe_id: 'r1', sort_order: 0, text: 'Step one: boil water', time_minutes: 5, step_image_filename: null },
    { id: 's2', recipe_id: 'r1', sort_order: 1, text: 'Step two: add pasta', time_minutes: null, step_image_filename: null },
    { id: 's3', recipe_id: 'r1', sort_order: 2, text: 'Step three: drain and serve', time_minutes: null, step_image_filename: null },
  ],
}

const mockGetRecipe = jest.fn()

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'r1' }),
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
}))

jest.mock('@miximixi/shared/api', () => ({
  getRecipe: (...args: unknown[]) => mockGetRecipe(...args),
  getStepImageUrl: (id: string, f: string) => `https://api.test/images/${id}/${f}`,
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
  mockGetRecipe.mockResolvedValue(mockRecipe)
})

describe('CookScreen', () => {
  test('renders step text', async () => {
    const { getByTestId } = render(<CookScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('step-text')).toBeTruthy())
    expect(getByTestId('step-text').props.children).toBe('Step one: boil water')
  })

  test('shows step counter', async () => {
    const { getByTestId } = render(<CookScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('step-counter')).toBeTruthy())
    expect(getByTestId('step-counter').props.children).toContain('Step 1 of 3')
  })

  test('activates keepawake via useKeepAwake hook', async () => {
    render(<CookScreen />, { wrapper })
    await waitFor(() =>
      expect(KeepAwake.useKeepAwake).toHaveBeenCalled()
    )
  })

  test('next button advances to step 2', async () => {
    const { getByTestId } = render(<CookScreen />, { wrapper })
    await waitFor(() => getByTestId('next-step-button'))
    fireEvent.press(getByTestId('next-step-button'))
    await waitFor(() =>
      expect(getByTestId('step-counter').props.children).toContain('Step 2 of 3')
    )
  })

  test('prev button is disabled on first step', async () => {
    const { getByTestId } = render(<CookScreen />, { wrapper })
    await waitFor(() => getByTestId('prev-step-button'))
    expect(getByTestId('prev-step-button').props.accessibilityState?.disabled).toBe(true)
  })

  test('shows timer for step with time', async () => {
    const { getByTestId } = render(<CookScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('cook-step-timer')).toBeTruthy())
  })

  test('shows finish button on last step', async () => {
    const { getByTestId } = render(<CookScreen />, { wrapper })
    await waitFor(() => getByTestId('next-step-button'))
    fireEvent.press(getByTestId('next-step-button')) // → step 2
    fireEvent.press(getByTestId('next-step-button')) // → step 3 (last)
    await waitFor(() => expect(getByTestId('finish-button')).toBeTruthy())
  })
})
