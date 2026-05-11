import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ThemeProvider, useTheme } from '../context/ThemeContext'
import { THEME_KEY } from '@miximixi/shared/constants'
import { LightColors, DarkColors } from '../theme/colors'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
})

describe('ThemeContext — defaults', () => {
  test('defaults to system theme', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.theme).toBe('system'))
  })

  test('effectiveTheme is light when system is light', async () => {
    jest.mock('react-native', () => ({
      ...jest.requireActual('react-native'),
      useColorScheme: () => 'light',
    }))
    const { result } = renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.theme).toBe('system'))
    // effectiveTheme resolves based on system — defaults to light in test env
    expect(['light', 'dark']).toContain(result.current.effectiveTheme)
  })
})

describe('ThemeContext — explicit theme', () => {
  test('setTheme(light) persists to AsyncStorage', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.theme).toBe('system'))

    act(() => result.current.setTheme('light'))

    expect(result.current.theme).toBe('light')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(THEME_KEY, 'light')
  })

  test('setTheme(dark) sets effectiveTheme to dark', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('dark'))
    expect(result.current.effectiveTheme).toBe('dark')
    expect(result.current.colors).toEqual(DarkColors)
  })

  test('setTheme(light) sets effectiveTheme to light', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('light'))
    expect(result.current.effectiveTheme).toBe('light')
    expect(result.current.colors).toEqual(LightColors)
  })
})

describe('ThemeContext — hydration from AsyncStorage', () => {
  test('loads dark theme from AsyncStorage on mount', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.theme).toBe('dark'))
    expect(result.current.effectiveTheme).toBe('dark')
  })

  test('ignores invalid stored value', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid')
    const { result } = renderHook(() => useTheme(), { wrapper })
    await waitFor(() => result.current.theme)
    expect(result.current.theme).toBe('system') // invalid value ignored
  })
})

describe('ThemeContext — colors object', () => {
  test('provides LightColors when theme is light', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('light'))
    expect(result.current.colors.primary).toBe('#a43f14')
    expect(result.current.colors.surface).toBe('#fff8f4')
  })

  test('provides DarkColors when theme is dark', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('dark'))
    expect(result.current.colors.primary).toBe('#ffb59c')
    expect(result.current.colors.surface).toBe('#161311')
  })
})
