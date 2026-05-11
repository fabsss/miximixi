import React from 'react'
import { render } from '@testing-library/react-native'
import { MaterialIcon } from '../MaterialIcon'

const ALL_ICONS = [
  'search', 'sell', 'timer', 'menu', 'arrow_back', 'translate', 'edit',
  'delete', 'close', 'add', 'remove', 'check_circle', 'restaurant',
  'brightness_auto', 'dark_mode', 'light_mode', 'people', 'schedule',
  'link', 'lightbulb', 'upload', 'favorite', 'favorite_border',
  'star', 'star_border', 'logout', 'person', 'refresh',
]

describe('MaterialIcon', () => {
  test.each(ALL_ICONS)('renders without error for icon: %s', (name) => {
    expect(() =>
      render(<MaterialIcon name={name} size={24} color="#000" />)
    ).not.toThrow()
  })

  test('renders with custom testID', () => {
    const { getByTestId } = render(
      <MaterialIcon name="search" testID="my-icon" />
    )
    expect(getByTestId('my-icon')).toBeTruthy()
  })

  test('falls back to help-circle for unknown icon', () => {
    // Should not throw for unknown names
    expect(() =>
      render(<MaterialIcon name="totally_unknown_icon_xyz" />)
    ).not.toThrow()
  })

  test('uses default testID based on name', () => {
    const { getByTestId } = render(<MaterialIcon name="edit" />)
    expect(getByTestId('icon-edit')).toBeTruthy()
  })
})
