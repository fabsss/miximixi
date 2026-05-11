import { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LightColors, DarkColors, type AppColors } from '../theme/colors'
import { THEME_KEY } from '@miximixi/shared/constants'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  effectiveTheme: 'light' | 'dark'
  colors: AppColors
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme()
  const [theme, setThemeState] = useState<Theme>('system')

  // Load persisted theme preference
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(stored => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeState(stored)
      }
    })
  }, [])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    AsyncStorage.setItem(THEME_KEY, newTheme)
  }

  const effectiveTheme: 'light' | 'dark' =
    theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : theme

  const colors = effectiveTheme === 'dark' ? DarkColors : LightColors

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
