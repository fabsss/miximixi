import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RecipeCard } from '../RecipeCard'
import { ThemeProvider } from '../../context/ThemeContext'
import type { RecipeListItem } from '@miximixi/shared/types'

jest.mock('@miximixi/shared/api', () => ({
  getImageUrl: (id: string) => `https://api.test/images/${id}`,
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
)

const baseRecipe: RecipeListItem = {
  id: 'r1',
  slug: 'test-recipe-r1',
  title: 'Test Pasta',
  category: 'Hauptspeisen',
  image_filename: 'cover.jpg',
  source_url: null,
  source_label: null,
  rating: 0,
  tags: ['Vegan'],
  created_at: '2024-01-01T00:00:00Z',
}

describe('RecipeCard', () => {
  test('renders the recipe title', () => {
    const { getByText } = render(
      <RecipeCard recipe={baseRecipe} onPress={jest.fn()} />,
      { wrapper },
    )
    expect(getByText('Test Pasta')).toBeTruthy()
  })

  test('renders category icon badge', () => {
    const { getByTestId } = render(
      <RecipeCard recipe={baseRecipe} onPress={jest.fn()} />,
      { wrapper },
    )
    // Hauptspeisen maps to 'food' icon — icon badge replaces the old CategoryChip
    expect(getByTestId('icon-food')).toBeTruthy()
  })

  test('shows favorite badge when rating is 1', () => {
    const { getByTestId } = render(
      <RecipeCard recipe={{ ...baseRecipe, rating: 1 }} onPress={jest.fn()} />,
      { wrapper },
    )
    expect(getByTestId('favorite-badge')).toBeTruthy()
  })

  test('does NOT show favorite badge when rating is 0', () => {
    const { queryByTestId } = render(
      <RecipeCard recipe={{ ...baseRecipe, rating: 0 }} onPress={jest.fn()} />,
      { wrapper },
    )
    expect(queryByTestId('favorite-badge')).toBeNull()
  })

  test('calls onPress with recipe when pressed', () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <RecipeCard recipe={baseRecipe} onPress={onPress} />,
      { wrapper },
    )
    fireEvent.press(getByTestId('recipe-card-r1'))
    expect(onPress).toHaveBeenCalledWith(baseRecipe)
  })

  test('renders without image when image_filename is null', () => {
    const { getByTestId } = render(
      <RecipeCard recipe={{ ...baseRecipe, image_filename: null }} onPress={jest.fn()} />,
      { wrapper },
    )
    expect(getByTestId('recipe-card-r1')).toBeTruthy()
  })

  test('renders without category icon badge when category is null', () => {
    const { queryByTestId } = render(
      <RecipeCard recipe={{ ...baseRecipe, category: null }} onPress={jest.fn()} />,
      { wrapper },
    )
    expect(queryByTestId('icon-food')).toBeNull()
  })
})
