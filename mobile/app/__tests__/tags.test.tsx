import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import TagsScreen from '../(app)/tags'
import { ThemeProvider } from '../../src/context/ThemeContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockTags = [
  { tag: 'Vegan', count: 12 },
  { tag: 'Glutenfrei', count: 8 },
  { tag: 'Schnell', count: 5 },
]

const mockGetTagsWithCounts = jest.fn()
const mockMergeTags = jest.fn()

jest.mock('@miximixi/shared/api', () => ({
  getTagsWithCounts: (...args: unknown[]) => mockGetTagsWithCounts(...args),
  mergeTags: (...args: unknown[]) => mockMergeTags(...args),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetTagsWithCounts.mockResolvedValue(mockTags)
  mockMergeTags.mockResolvedValue({ updated_recipes: 3 })
})

describe('TagsScreen', () => {
  test('renders tag list', async () => {
    const { getByTestId } = render(<TagsScreen />, { wrapper })
    await waitFor(() => {
      expect(getByTestId('tag-row-Vegan')).toBeTruthy()
      expect(getByTestId('tag-row-Glutenfrei')).toBeTruthy()
    })
  })

  test('shows tag counts', async () => {
    const { getByText } = render(<TagsScreen />, { wrapper })
    await waitFor(() => {
      expect(getByText('12')).toBeTruthy()
      expect(getByText('8')).toBeTruthy()
    })
  })

  test('selecting tags updates selection', async () => {
    const { getByTestId } = render(<TagsScreen />, { wrapper })
    await waitFor(() => getByTestId('tag-row-Vegan'))
    fireEvent.press(getByTestId('tag-row-Vegan'))
    // Merge panel should appear
    await waitFor(() => expect(getByTestId('merge-button')).toBeTruthy())
  })

  test('selecting multiple tags shows count', async () => {
    const { getByTestId, getByText } = render(<TagsScreen />, { wrapper })
    await waitFor(() => getByTestId('tag-row-Vegan'))
    fireEvent.press(getByTestId('tag-row-Vegan'))
    fireEvent.press(getByTestId('tag-row-Glutenfrei'))
    await waitFor(() => expect(getByText(/2 tags selected/)).toBeTruthy())
  })

  test('merge button shows input field', async () => {
    const { getByTestId } = render(<TagsScreen />, { wrapper })
    await waitFor(() => getByTestId('tag-row-Vegan'))
    fireEvent.press(getByTestId('tag-row-Vegan'))
    await waitFor(() => getByTestId('merge-button'))
    fireEvent.press(getByTestId('merge-button'))
    await waitFor(() => expect(getByTestId('merge-target-input')).toBeTruthy())
  })

  test('confirms merge and calls API', async () => {
    const { Alert } = require('react-native')
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(
      (_title, _msg, buttons) => buttons?.[1]?.onPress?.(),
    )
    const { getByTestId } = render(<TagsScreen />, { wrapper })
    await waitFor(() => getByTestId('tag-row-Vegan'))

    fireEvent.press(getByTestId('tag-row-Vegan'))
    await waitFor(() => getByTestId('merge-button'))
    fireEvent.press(getByTestId('merge-button'))
    await waitFor(() => getByTestId('merge-target-input'))

    fireEvent.changeText(getByTestId('merge-target-input'), 'PlantBased')
    await act(async () => { fireEvent.press(getByTestId('merge-confirm-button')) })

    await waitFor(() => expect(mockMergeTags).toHaveBeenCalledWith(['Vegan'], 'PlantBased'))
    alertSpy.mockRestore()
  })

  test('deselect button clears selection', async () => {
    const { getByTestId, queryByTestId } = render(<TagsScreen />, { wrapper })
    await waitFor(() => getByTestId('tag-row-Vegan'))
    fireEvent.press(getByTestId('tag-row-Vegan'))
    await waitFor(() => getByTestId('deselect-all-button'))
    fireEvent.press(getByTestId('deselect-all-button'))
    await waitFor(() => expect(queryByTestId('deselect-all-button')).toBeNull())
  })
})
