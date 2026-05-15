import React from 'react'
import { render } from '@testing-library/react-native'
import { CategoryChip } from '../CategoryChip'
import { ThemeProvider } from '../../context/ThemeContext'

jest.mock('@miximixi/shared/categoryUtils', () => ({
  getCategoryIcon: (cat: string) => `icon-${cat}`,
  getCategoryLabel: (cat: string) => cat.charAt(0).toUpperCase() + cat.slice(1),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
)

const CATEGORIES = ['vorspeisen', 'hauptspeisen', 'desserts', 'brunch', 'snacks', 'drinks']

describe('CategoryChip', () => {
  test.each(CATEGORIES)('renders chip for %s', (cat) => {
    const { getByTestId } = render(
      <CategoryChip category={cat} />,
      { wrapper },
    )
    expect(getByTestId(`category-chip-${cat}`)).toBeTruthy()
  })

  test.each(CATEGORIES)('shows correct label for %s', (cat) => {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1)
    const { getByText } = render(
      <CategoryChip category={cat} />,
      { wrapper },
    )
    expect(getByText(label)).toBeTruthy()
  })

  test('accepts sm size variant', () => {
    const { getByTestId } = render(
      <CategoryChip category="desserts" size="sm" />,
      { wrapper },
    )
    expect(getByTestId('category-chip-desserts')).toBeTruthy()
  })

  test('uses custom testID when provided', () => {
    const { getByTestId } = render(
      <CategoryChip category="drinks" testID="custom-chip" />,
      { wrapper },
    )
    expect(getByTestId('custom-chip')).toBeTruthy()
  })
})
